# CI/CD

Two GitHub Actions workflows build every deliverable of the repository: the
Android app, the iOS app, the web build and the game server's Docker image.

| Workflow | Trigger | Result |
|---|---|---|
| [`ci.yml`](../.github/workflows/ci.yml) | every push to `main`, every PR, manual | A pass/fail gate. Nothing is published. |
| [`release.yml`](../.github/workflows/release.yml) | a `v*.*.*` tag, or manual with an existing tag | A **draft** GitHub Release with signed Android files, the web zip and checksums. The server image is pushed to GHCR, with an optional deploy. |

Both workflows post their result to Telegram (see
[telegram-notifications.md](telegram-notifications.md)).

---

## `ci.yml`: the gate

```
verify ──┬── server         (bundle + Docker image, not pushed)
         ├── web            (static export)
         ├── build-android  (release APK, R8 + shrinking, debug-signed, permission audit)
         └── build-ios      (Release, device SDK, no codesign)
                    └── notify (Telegram, pushes to main only)
```

| Job | What it enforces |
|---|---|
| **Format, lint, typecheck & test** | `npm ci` fails if the lockfile has drifted. `tool/version.mjs check` fails if the versions disagree. Then Prettier, ESLint (Expo config) and `tsc` in every workspace run, followed by the 26 engine and 6 server tests with coverage. The `coverage-lcov` artifact is kept for 14 days. |
| **Server bundle & Docker image** | The tsup bundle and the production Dockerfile still build. The Docker layer cache is shared with releases. |
| **Web build** | `expo export --platform web` still produces the static site. |
| **Android release build** | Builds the real release configuration (Hermes bytecode, R8 minification, resource shrinking) for arm64-v8a, so a shrinking or native regression is caught in the PR that causes it. Then `tool/check-android-permissions.sh` fails the job if the APK requests anything beyond `INTERNET`, `ACCESS_NETWORK_STATE` and `VIBRATE`. |
| **iOS release build** | `expo prebuild`, `pod install`, then `xcodebuild … -sdk iphoneos CODE_SIGNING_ALLOWED=NO`. This compiles and links exactly as a store build does, without Apple credentials. |

A newer push to the same branch cancels the run in progress. Runs on `main`
are never cancelled.

---

## `release.yml`: shipping a version

### Cutting a release

```bash
# 1. Bump the version everywhere (root, workspaces, app.json) and commit it.
npm run version:set 1.2.0
git commit -am "Release 1.2.0"

# 2. Tag and push.
git tag v1.2.0
git push origin main v1.2.0
```

The run then does the following:

1. **Verifies** the tag against every `package.json` and `apps/mobile/app.json`,
   then re-runs format, lint, typecheck and tests. A mismatched tag stops here,
   before anything is built.
2. **Server image:** builds and pushes `ghcr.io/<owner>/gridlock-server:<version>` and `:latest`.
   If `SERVER_DEPLOY_HOOK_URL` is set, it calls that hook so your host pulls the new image.
3. **Web:** exports the static site with the production server URL baked in and zips it.
4. **Android:** builds all four architectures in two Gradle runs, the bundle first. AGP refuses to
   build an `.aab` while ABI splits are on ([issue 402800800](https://issuetracker.google.com/402800800)).
   It produces:
   - `gridlock-<version>.aab`: **the file to upload to Google Play**
   - `gridlock-<version>-universal.apk` and one APK per ABI: for sideloading and testing
   - `gridlock-<version>-js-sourcemap.map` (Hermes/JS) and `gridlock-<version>-r8-mapping.txt` (Java/Kotlin).
     **Keep these:** without them, crash reports from a minified release are unreadable.
5. **Publishes a draft GitHub Release** with all of the above plus `SHA256SUMS.txt`. The release
   page summarises signing status, the server URL baked into the app, the image tag and whether
   the server was deployed. Review it and click *Publish*.

Version numbers:

- The **version name** (what users see) comes from `app.json`, which the tag must match.
- The Android **version code** is the workflow run number, which only ever increases, as Play requires.

When secrets are missing, the run still succeeds but says so plainly. With no keystore, the
Android files are named `-UNSIGNED` and the release page and Telegram message warn that they
can't be uploaded to Play. With no `PRODUCTION_SERVER_URL`, the release warns that the app has no
server to connect to.

### How signing works with Expo

`android/` is generated at build time by `expo prebuild` and is never committed. So the release
signing setup lives in a config plugin,
[`apps/mobile/plugins/with-android-release.js`](../apps/mobile/plugins/with-android-release.js).
The plugin rewrites `app/build.gradle` on every prebuild:

- If `android/keystore.properties` exists, release builds are signed with that upload key.
- If it doesn't, they fall back to the debug key, exactly as the Expo template does.
- It also adds ABI splits, which are only enabled when Gradle is given `-PsplitApks`.

CI writes `keystore.properties` from secrets into the runner's temp directory, and shreds both
files in an `if: always()` step.

---

## Secrets and variables

Set these in **Settings → Secrets and variables → Actions**.

| Name | Kind | Needed for | Without it |
|---|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | secret | Play-uploadable AAB/APKs | Files are debug-signed and named `-UNSIGNED` |
| `ANDROID_KEYSTORE_PASSWORD` | secret | 〃 | 〃 |
| `ANDROID_KEY_ALIAS` | secret | 〃 | 〃 |
| `ANDROID_KEY_PASSWORD` | secret | 〃 | 〃 |
| `PRODUCTION_SERVER_URL` | **variable** | The server the release app and web build connect to, e.g. `https://game.example.com` | The app can't reach a server (the release warns) |
| `SERVER_DEPLOY_HOOK_URL` | secret | Automatic server deploy after the image is pushed | The image is published only |
| `TELEGRAM_BOT_TOKEN` | secret | Build notifications | The notify step warns and skips |
| `TELEGRAM_CHAT_ID` | secret | 〃 | 〃 |

`GITHUB_TOKEN` is provided automatically. The release workflow grants it `packages: write` for
GHCR and `contents: write` for the draft release, each only in the job that needs it.

### Creating the upload keystore (once)

```bash
keytool -genkeypair -v -keystore upload-keystore.jks \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000

gh secret set ANDROID_KEYSTORE_BASE64   < <(base64 -w0 upload-keystore.jks)
gh secret set ANDROID_KEYSTORE_PASSWORD -b '<store password>'
gh secret set ANDROID_KEY_ALIAS         -b 'upload'
gh secret set ANDROID_KEY_PASSWORD      -b '<key password>'
gh variable set PRODUCTION_SERVER_URL   -b 'https://game.example.com'
```

Enrol the app in **Play App Signing** and upload the first AAB by hand. From then on this key is
only the *upload* key, and Google holds the app signing key. Back up `upload-keystore.jks` and its
passwords somewhere safe outside the repository. **Never commit it**: `.gitignore` excludes
`*.jks`, `*.keystore` and `keystore.properties`.

### Server deploy hook

The hook is sent a `POST` with the body `{"image": "ghcr.io/…:<version>"}`. Any host with a
"deploy hook" URL works: Render, Railway, Coolify, Dokploy, or a small webhook on your own VM that
runs `docker compose pull && docker compose up -d`. The GHCR package is private by default. Either
make it public, or give the host a read-only token.

---

## Running the builds locally

The same commands the workflows run:

```bash
npm ci
npm run format:check && npm run lint && npm run typecheck && npm run test:coverage
npm run build:server && docker build -f apps/server/Dockerfile -t gridlock-server .
npm run build:web                                   # → apps/mobile/dist-web

# Android release (needs JDK 17+ and the Android SDK)
cd apps/mobile
ANDROID_VERSION_CODE=1 npx expo prebuild --platform android --clean --no-install
cd android
export EXPO_PUBLIC_SERVER_URL=https://game.example.com
./gradlew bundleRelease                  # .aab (must be its own run; see below)
./gradlew assembleRelease -PsplitApks    # universal + per-ABI APKs
cd ../../.. && ./tool/check-android-permissions.sh
```

To sign locally, put a `keystore.properties` in `apps/mobile/android/` (it is regenerated away by
`prebuild --clean`, so write it after prebuilding):

```properties
storeFile=/absolute/path/upload-keystore.jks
storePassword=…
keyAlias=upload
keyPassword=…
```

For a test APK that talks to a plain-HTTP server on your LAN, prebuild with
`ANDROID_ALLOW_CLEARTEXT=1`. Release builds otherwise allow HTTPS/WSS only.

---

## iOS store builds

CI proves that iOS compiles, but it doesn't sign or upload, because that needs an Apple Developer
account. When you have one, the simplest route is EAS, which manages certificates and profiles for
you:

```bash
cd apps/mobile
npx eas-cli@latest build:configure
IOS_BUILD_NUMBER=<n> EXPO_PUBLIC_SERVER_URL=https://game.example.com \
  npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios
```

The same `app.config.ts` is used, so the version and build number rules are identical. Once
credentials exist, the step can move into `release.yml` using an `EXPO_TOKEN` secret.

---

## Dependabot

[`.github/dependabot.yml`](../.github/dependabot.yml) opens grouped update PRs:

- npm weekly, minor and patch grouped
- GitHub Actions monthly
- the server's Docker base image monthly

Expo SDK and React Native packages are excluded on purpose. They must move together with the SDK
(`npx expo install --fix`), so upgrade them in a deliberate SDK-bump PR.
