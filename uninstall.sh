#!/usr/bin/env bash
# Removes C-Studio from ~/.config/herdr-app and switches back to Herdr's main layout
set -euo pipefail

DEST="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"

# Leave the layout first, while its files still exist (needs Herdr running; harmless otherwise)
herdr-app do layout.switch '{"name":"main"}' >/dev/null 2>&1 || true

rm -f "$DEST/layouts/c-studio.json" "$DEST/layouts/c-studio-mc.json" "$DEST"/themes/c-studio-*.json "$DEST/c-studio.json"
rm -rf "$DEST"/mods/c-studio-*/

# Drop the layout:c-studio key bindings, keeping a copy of keys.json
if [ -f "$DEST/keys.json" ]; then
  cp "$DEST/keys.json" "$DEST/keys.json.bak-$(date +%Y%m%d%H%M%S)"
  python3 - "$DEST/keys.json" <<'EOF'
import json, sys
path = sys.argv[1]
keys = json.load(open(path))
keys.pop("layout:c-studio", None)
json.dump(keys, open(path, "w"), indent=2)
EOF
fi

# Copilot CLI status hooks (only ours; other hooks in that folder stay)
rm -f "$HOME"/.copilot/hooks/herdr-status.{sh,json}

# Remembered state (dock width, folded spaces, recent folders…). Herdr keeps it in memory
# and writes it back, so this only sticks when Herdr is not running.
if [ -f "$DEST/shared.json" ] && ! pgrep -qf 'Herdr.app/Contents/MacOS/Herdr'; then
  python3 - "$DEST/shared.json" <<'EOF'
import json, sys
path = sys.argv[1]
state = json.load(open(path))
mine = ("dock.", "c-studio", "studio-")
state = {k: v for k, v in state.items() if not k.startswith(mine)}
if state.get("layout") == "c-studio":
    state["layout"] = "main"
json.dump(state, open(path, "w"))
EOF
fi

echo "C-Studio removed."
