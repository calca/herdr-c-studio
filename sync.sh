#!/usr/bin/env bash
# Copies the Studio files from ~/.config/herdr-app back into this repo
set -euo pipefail

SRC="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
DEST="$(cd "$(dirname "$0")" && pwd)"

# kit.js is shared code: every mod holds an identical copy (Herdr won't import across mods)
kits=("$SRC"/mods/studio-*/kit.js)
for k in "${kits[@]}"; do
  if ! cmp -s "$k" "${kits[0]}"; then
    echo "kit.js differs: $k vs ${kits[0]}" >&2
    exit 1
  fi
done

cp "$SRC/layouts/studio.json" "$DEST/layouts/"
cp "$SRC"/themes/{macos,claude}-{dark,light}.json "$DEST/themes/"
for m in "$SRC"/mods/studio-*/; do
  name="$(basename "$m")"
  rsync -a --delete --exclude gpui-kit.d.ts "$m" "$DEST/mods/$name/"
done

python3 - "$SRC/keys.json" "$DEST/keys.studio.json" <<'PY'
import json, sys
src, dest = sys.argv[1:3]
json.dump({"layout:studio": json.load(open(src))["layout:studio"]}, open(dest, "w"), indent=2)
PY

git -C "$DEST" status --short
