# herdr-studio

Custom macOS-style layout for [Herdr.app](https://herdr.app): minimal, hover-peek spaces dock, ochre/indigo agent status.

## Contents

- `layouts/studio.json` – the layout
- `mods/studio-dock` – floating spaces dock (peek on hover, pin with ⌘B; pinning keeps the top strip for window drag)
- `mods/studio-tabs` – tab bar with agent session titles and accent underline
- `mods/studio-status` – flat status bar (working / needs you / idle)
- `themes/macos-{dark,light}.json` – palettes
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
