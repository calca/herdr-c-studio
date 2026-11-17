#!/usr/bin/env bash
# Copies the C-Studio files from ~/.config/herdr-app back into this repo
set -euo pipefail

SRC="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
DEST="$(cd "$(dirname "$0")" && pwd)"

# kit.js is shared code: every mod holds an identical copy (Herdr won't import across mods)
kits=("$SRC"/mods/c-studio-*/kit.js)
for k in "${kits[@]}"; do
  if ! cmp -s "$k" "${kits[0]}"; then
    echo "kit.js differs: $k vs ${kits[0]}" >&2
    exit 1
  fi
done

cp "$SRC/layouts/c-studio.json" "$DEST/layouts/"
cp "$SRC"/themes/{macos,c-studio}-{dark,light}.json "$SRC"/themes/c-studio-{dark,light}-*.json "$DEST/themes/"
for m in "$SRC"/mods/c-studio-*/; do
  name="$(basename "$m")"
  rsync -a --delete --exclude gpui-kit.d.ts "$m" "$DEST/mods/$name/"
done

python3 - "$SRC/keys.json" "$DEST/keys.c-studio.json" <<'PY'
import json, sys
src, dest = sys.argv[1:3]
json.dump({"layout:c-studio": json.load(open(src))["layout:c-studio"]}, open(dest, "w"), indent=2)
PY

git -C "$DEST" status --short
