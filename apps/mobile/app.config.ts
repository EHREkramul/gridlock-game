import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Static settings live in app.json. This file only adds what differs per build,
 * all of it read from the environment so CI can set it without editing files:
 *
 * - ANDROID_VERSION_CODE / IOS_BUILD_NUMBER: the store build number. CI uses the
 *   workflow run number, which only ever increases, as both stores require.
 * - The marketing version (expo.version) comes from app.json and is kept in step
 *   with every package.json by `npm run version:set` (tool/version.mjs).
 */
const buildNumber = (name: string) => {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : 1;
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer, got "${raw}"`);
  return n;
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  android: {
    ...config.android,
    versionCode: buildNumber('ANDROID_VERSION_CODE'),
    // Everything the game needs is the network. Libraries are not allowed to
    // add more behind our back; tool/check-android-permissions.sh enforces it.
    permissions: ['android.permission.INTERNET', 'android.permission.VIBRATE'],
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.CAMERA',
    ],
  },
  ios: {
    ...config.ios,
    buildNumber: String(buildNumber('IOS_BUILD_NUMBER')),
    infoPlist: {
      ...config.ios?.infoPlist,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  plugins: [
    ...(config.plugins ?? []),
    [
      'expo-build-properties',
      {
        // R8 code shrinking + resource shrinking for release builds; the
        // mapping file needed to read crash reports is published with them.
        android: {
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          // Release builds speak HTTPS/WSS only. ANDROID_ALLOW_CLEARTEXT=1 is for
          // test builds pointed at a plain-HTTP server on the LAN.
          usesCleartextTraffic: process.env.ANDROID_ALLOW_CLEARTEXT === '1',
        },
      },
    ],
    './plugins/with-android-release',
  ],
});
