# herdr-c-studio

Custom macOS-style layout for [Herdr.app](https://herdr.app): minimal, hover-peek spaces dock, Claude-inspired warm themes.

## Contents

- `layouts/c-studio.json` – the layout
- `mods/c-studio-dock` – floating spaces dock with all tabs (peek on hover, pin with ⌘B; auto-pins when the window is ≥1500 px, folds below 1400 px; click the active space to collapse its tabs; spaces in their colors (right-click a space to pick one or rename it), program icons, drag to reorder tabs or drop one on another space to move it, × on hover)
- `mods/c-studio-tabs` – tab bar with agent session titles; active tab as a soft pill in the space color, status dot first; a ⌄ button lists the space's tabs when they don't fit
- `mods/c-studio-pane` – terminal pane header: repo-relative folder and git branch
- `mods/c-studio-status` – status bar; click working / needs you / idle to cycle agents, click the branch to copy it; ↑ahead ↓behind pushes or fast-forward pulls
- `mods/c-studio-palette` – Spotlight-style ⌘K / ⌘P search for tabs, spaces, agents and actions: fuzzy ("cc" → Claude Code), recent first, ⌘R renames and ⌘⌫ closes the selected tab, "Move tab to …" moves the focused tab to another space (processes keep running)
- Files / Changes side panel (Herdr's `files` and `changes` mods): F / C in the tab bar, ⇧⌘E / ⇧⌘G, or click +N −M in the status bar; remembered per space, folds under 1100 px
- `mods/c-studio-close` – × / ⌘W on a tab running more than a shell asks: Park (keep it running in the background), Close, or Cancel
- `mods/c-studio-launch` – new-tab launcher (⌘K → New tab…; ⌘T and + open a terminal straight away): Terminal or an installed agent, in the folder you came from, a recent folder (⌥1–5), or a new worktree
- `mods/c-studio-toast` – notifications in the palette style, with a Go button when they lead somewhere
- `themes/c-studio-{dark,light}.json` – warm palettes used by the layout; `c-studio-{dark,light}-<color>.json` are accent variants that c-studio-status switches to so the focus border follows the space color; `themes/macos-{dark,light}.json` – cool alternative
- `keys.c-studio.json` – `layout:c-studio` key bindings, merged into `keys.json`

## Install

```bash
./install.sh
herdr-app do layout.switch '{"name":"c-studio"}'
```

## Update the repo after tweaking the layout

```bash
./sync.sh   # copies the files from ~/.config/herdr-app, shows git status
```

`kit.js` (panel toggling, tab names, dock pinning) is shared code. Herdr only resolves imports inside a mod's folder, so each mod that uses it keeps an identical copy: edit one, copy it to the others, and `sync.sh` stops if they differ.

Shipped Herdr layouts and mods are overwritten on app start; this repo only holds the custom ones.
