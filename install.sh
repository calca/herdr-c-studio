#!/usr/bin/env bash
# Installs the C-Studio layout, mods and themes into ~/.config/herdr-app
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"

mkdir -p "$DEST/layouts" "$DEST/themes" "$DEST/mods"
cp "$SRC"/layouts/c-studio.json "$SRC"/layouts/c-studio-mc.json "$DEST/layouts/"
cp "$SRC"/themes/*.json "$DEST/themes/"
for m in "$SRC"/mods/*/; do
  name="$(basename "$m")"
  mkdir -p "$DEST/mods/$name"
  cp -R "$m". "$DEST/mods/$name/"
done

# Keep the previous keys.json next to it before merging
[ -f "$DEST/keys.json" ] && cp "$DEST/keys.json" "$DEST/keys.json.bak-$(date +%Y%m%d%H%M%S)"

# Merge the layout:c-studio key bindings without touching other entries
python3 - "$DEST/keys.json" "$SRC/keys.c-studio.json" <<'EOF'
import json, os, sys
dest, src = sys.argv[1:3]
keys = json.load(open(dest)) if os.path.exists(dest) else {}
keys.update(json.load(open(src)))
json.dump(keys, open(dest, "w"), indent=2)
EOF

# Copilot CLI status hooks (working / needs you / done dots)
mkdir -p "$HOME/.copilot/hooks"
cp "$SRC"/hooks/copilot/herdr-status.{sh,json} "$HOME/.copilot/hooks/"
chmod +x "$HOME/.copilot/hooks/herdr-status.sh"

# What is installed and where from, for the update notice in the status bar
python3 - "$DEST/c-studio.json" "$(cat "$SRC/VERSION")" "$SRC" <<'EOF2'
import json, os, sys
path, version, src = sys.argv[1:4]
json.dump({"version": version, "source": src if os.path.isdir(os.path.join(src, ".git")) else None}, open(path, "w"), indent=2)
EOF2

echo "Installed C-Studio v$(cat "$SRC/VERSION"). Switch with: herdr-app do layout.switch '{\"name\":\"c-studio\"}'"
