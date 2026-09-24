# Telegram build notifications

Every CI run on `main` and every release build posts its result to a Telegram
chat. This page covers first-time setup and how to port the same notifier to
another repository.

There is no marketplace action involved — it is a `curl` to the Telegram Bot
API. That matters: a third-party action in a workflow runs with access to the
job's secrets and token, and this one has nothing to audit beyond the shell
block in the workflow itself.

## What gets sent

| Workflow | When | Contents |
|---|---|---|
| `ci.yml` | Every push to `main`, pass or fail | Per-job results (tests, server, web, Android, iOS), commit SHA and subject, author, run link |
| `release.yml` | Every `v*.*.*` tag build | Version, version code, tag, **signing status**, **server URL baked into the app**, server image, deploy status, draft-release link |

Pull request runs are deliberately silent. They are the noisiest event in a
repo and the one you are least likely to act on from a phone.

The release message reports signing and the baked-in server URL explicitly,
because a run that succeeds while producing debug-signed artifacts — or an app
with no server to talk to — is a run that produced nothing you can ship.
"Succeeded" alone would be misleading.

## One-time setup

### 1. Create the bot

In Telegram, message [@BotFather](https://t.me/BotFather):

```
/newbot
```

Give it a name and a username. BotFather replies with a token that looks like
`8123456789:AAH...`. **That token is a credential** — anyone holding it can
post as your bot. It goes in GitHub Secrets, never in a file.

### 2. Find your chat ID

Send your new bot any message first — a bot cannot open a conversation with
you. Then:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates" \
  | grep -o '"chat":{"id":[-0-9]*' | head -1
```

A personal chat gives a positive number. To post into a group instead, add the
bot to the group, send a message there, and re-run the command — group IDs are
negative (e.g. `-1001234567890`).

### 3. Add the secrets

```bash
gh secret set TELEGRAM_BOT_TOKEN -b '8123456789:AAH...'
gh secret set TELEGRAM_CHAT_ID   -b '123456789'
```

Both workflows check for these and **skip the notification with a warning** if
either is missing, so a fork or a fresh clone never fails a build over a
notifier it was never configured for.

### 4. Verify

```bash
gh workflow run ci.yml && gh run watch
```

## Porting to another repository

Copy the `notify:` job from `.github/workflows/ci.yml` and change two things:

1. **`needs:`** — list that repo's job IDs.
2. **The body lines** — the `$(icon "...")` rows name this repo's jobs.

Then set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in the new repo. The same
bot can serve every repository; the message names the repo it came from. Use
the same chat, or a different one per project.

### Two things not to change

**Read run-time values through `env:`, never `${{ }}` inside `run:`.** GitHub
substitutes `${{ }}` into the script as literal text *before* bash parses it,
so a commit message containing `$(...)` or a backtick would execute on the
runner. Every value here is passed as an environment variable and referenced as
`"$VAR"`. This is a real, routinely exploited class of GitHub Actions bug, not a
hypothetical one.

**Keep `if: always()`.** Without it the job inherits the default
`success()` condition and only ever notifies you about builds that passed,
which is the opposite of what a build notifier is for.

## Notes

- `esc()` escapes `&`, `<` and `>` because the messages use Telegram's HTML
  parse mode; ampersand is escaped first so it does not re-escape the entities
  the later rules introduce.
- Only the first line of a commit message is sent. Full bodies turn a phone
  notification into a wall of text.
- `--fail-with-body` makes a rejected API call fail the step loudly rather than
  silently succeeding. The `notify` job is terminal, so a failure there cannot
  affect the build result.
