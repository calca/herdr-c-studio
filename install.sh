#!/usr/bin/env bash
# Installs the C-Studio layout, mods and themes into ~/.config/herdr-app
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"

mkdir -p "$DEST/layouts" "$DEST/themes" "$DEST/mods"
cp "$SRC/layouts/c-studio.json" "$DEST/layouts/"
cp "$SRC"/themes/*.json "$DEST/themes/"
for m in "$SRC"/mods/*/; do
  name="$(basename "$m")"
  mkdir -p "$DEST/mods/$name"
  cp -R "$m". "$DEST/mods/$name/"
done

# Merge the layout:c-studio key bindings without touching other entries
python3 - "$DEST/keys.json" "$SRC/keys.c-studio.json" <<'EOF'
import json, os, sys
dest, src = sys.argv[1:3]
keys = json.load(open(dest)) if os.path.exists(dest) else {}
keys.update(json.load(open(src)))
json.dump(keys, open(dest, "w"), indent=2)
EOF

echo "Installed. Switch with: herdr-app do layout.switch '{\"name\":\"c-studio\"}'"
