# herdr-studio

Custom macOS-style layout for [Herdr.app](https://herdr.app): minimal, hover-peek spaces dock, Claude-inspired warm themes.

## Contents

- `layouts/studio.json` – the layout
- `mods/studio-dock` – floating spaces dock with all tabs (peek on hover, pin with ⌘B; auto-pins when the window is ≥1500 px, folds below 1400 px)
- `mods/studio-tabs` – tab bar with agent session titles and accent underline
- `mods/studio-pane` – terminal pane header
- `mods/studio-status` – status bar; click working / needs you / idle to cycle agents, click the branch to copy it
- `mods/studio-palette` – Spotlight-style ⌘K search for tabs, spaces, agents and actions
- `mods/studio-toast` – notifications in the palette style
- `themes/claude-{dark,light}.json` – warm palettes used by the layout; `themes/macos-{dark,light}.json` – cool alternative
- `keys.studio.json` – `layout:studio` key bindings, merged into `keys.json`

## Install

```bash
./install.sh
herdr-app do layout.switch '{"name":"studio"}'
```

## Update the repo after tweaking the layout

```bash
./sync.sh   # copies the files from ~/.config/herdr-app, shows git status
```

Shipped Herdr layouts and mods are overwritten on app start; this repo only holds the custom ones.
