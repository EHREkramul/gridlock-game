#!/usr/bin/env bash
# Fails if a built APK requests any permission the game does not need.
#
# Gridlock needs the network and nothing else. All three allowed entries are
# "normal" permissions that Android grants silently, without a prompt:
# INTERNET for the game, ACCESS_NETWORK_STATE (merged in by React Native's
# networking stack to check connectivity) and VIBRATE for haptics. Libraries can merge
# extra permissions into the manifest silently; app.config.ts blocks the known
# offenders and this script catches anything new before it reaches a store
# listing.
#
# Permissions inside the app's own namespace are ignored: AndroidX synthesises
# <appId>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION, a private signature-level
# permission that grants access to nothing outside the app.
set -euo pipefail

APK="${1:-apps/mobile/android/app/build/outputs/apk/release/app-universal-release.apk}"
APP_ID="${2:-online.gridlock.app}"
ALLOWED=(
  android.permission.INTERNET
  android.permission.ACCESS_NETWORK_STATE
  android.permission.VIBRATE
)

[ -f "$APK" ] || { echo "No APK at $APK" >&2; exit 1; }

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
AAPT2=$(find "$SDK/build-tools" -name aapt2 2>/dev/null | sort -V | tail -1)
[ -n "$AAPT2" ] || { echo "aapt2 not found under $SDK/build-tools" >&2; exit 1; }

mapfile -t REQUESTED < <(
  "$AAPT2" dump permissions "$APK" \
    | grep '^uses-permission:' \
    | sed "s/.*name='\([^']*\)'.*/\1/" \
    | grep -v "^${APP_ID//./\\.}\\." || true
)

UNEXPECTED=()
for perm in "${REQUESTED[@]}"; do
  ok=false
  for allowed in "${ALLOWED[@]}"; do [ "$perm" = "$allowed" ] && ok=true && break; done
  $ok || UNEXPECTED+=("$perm")
done

if [ "${#UNEXPECTED[@]}" -gt 0 ]; then
  echo "::error::$APK requests ${#UNEXPECTED[@]} permission(s) outside the allow-list:"
  printf '  %s\n' "${UNEXPECTED[@]}"
  echo "Block them in apps/mobile/app.config.ts (android.blockedPermissions) or, if genuinely needed, add them to ALLOWED here."
  exit 1
fi

echo "OK: $APK requests only: ${REQUESTED[*]:-nothing}"
