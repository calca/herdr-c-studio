# herdr-studio

Custom macOS-style layout for [Herdr.app](https://herdr.app): minimal, hover-peek spaces dock, Claude-inspired warm themes.

## Contents

- `layouts/studio.json` – the layout
- `mods/studio-dock` – floating spaces dock with all tabs (peek on hover, pin with ⌘B; auto-pins when the window is ≥1500 px, folds below 1400 px; click the active space to collapse its tabs; spaces in their colors, program icons, drag to reorder tabs, × on hover)
- `mods/studio-tabs` – tab bar with agent session titles; active tab as a soft pill, status dot first
- `mods/studio-pane` – terminal pane header: repo-relative folder and git branch
- `mods/studio-status` – status bar; click working / needs you / idle to cycle agents, click the branch to copy it
- `mods/studio-palette` – Spotlight-style ⌘K / ⌘P search for tabs, spaces, agents and actions: fuzzy ("cc" → Claude Code), recent first, ⌘R renames and ⌘⌫ closes the selected tab
- Files / Changes side panel (Herdr's `files` and `changes` mods): F / C in the tab bar, ⇧⌘E / ⇧⌘G, or click +N −M in the status bar; remembered per space, folds under 1100 px
- `mods/studio-launch` – new-tab launcher (⌘K → New tab…; ⌘T and + open a terminal straight away): Terminal or an installed agent, in the folder you came from, a recent folder, or a new worktree
- `mods/studio-toast` – notifications in the palette style
- `themes/claude-{dark,light}.json` – warm palettes used by the layout; `claude-{dark,light}-<color>.json` are accent variants that studio-status switches to so the focus border follows the space color; `themes/macos-{dark,light}.json` – cool alternative
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

`kit.js` (panel toggling, tab names, dock pinning) is shared code. Herdr only resolves imports inside a mod's folder, so each mod that uses it keeps an identical copy: edit one, copy it to the others, and `sync.sh` stops if they differ.

Shipped Herdr layouts and mods are overwritten on app start; this repo only holds the custom ones.
