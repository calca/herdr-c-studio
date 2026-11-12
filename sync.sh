#!/usr/bin/env bash
# Copies the Studio files from ~/.config/herdr-app back into this repo
set -euo pipefail

SRC="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
DEST="$(cd "$(dirname "$0")" && pwd)"

cp "$SRC/layouts/studio.json" "$DEST/layouts/"
cp "$SRC"/themes/{macos,claude}-{dark,light}.json "$DEST/themes/"
for m in "$DEST"/mods/*/; do
  name="$(basename "$m")"
  for f in "$SRC/mods/$name"/*; do
    case "$(basename "$f")" in gpui-kit.d.ts) continue ;; esac
    cp "$f" "$m"
  done
done

python3 - "$SRC/keys.json" "$DEST/keys.studio.json" <<'EOF'
import json, sys
src, dest = sys.argv[1:3]
json.dump({"layout:studio": json.load(open(src))["layout:studio"]}, open(dest, "w"), indent=2)
EOF

git -C "$DEST" status --short
