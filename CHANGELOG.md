# Changelog

All notable changes to C-Studio. Versions follow [Semantic Versioning](https://semver.org).

## [0.1.0] – unreleased

First public release.

- **Spaces dock** – pinned or folded away (⌘B or the layers button in the tab bar), pins itself on wide screens and folds on the laptop; drag its edge to resize; spaces in their own colors; collapsed spaces show how many agents are working or done; drag tabs to reorder them or move them to another space. A long list scrolls while the header and New space stay put.
- **Tab tray** – centered, rounded tray with up to 4 tabs, agent session titles and status dots; a ⌄ pill shows how many are hidden and lists them; round F / C toggles for the Files and Changes panels; on the laptop opening one folds the spaces dock until it closes.
- **Agent status** – working, done and needs you in the dock, the tabs and the status bar; ⌘J jumps to the next agent that needs you.
- **⌘-click links** – code files open in VS Code at the clicked line, images and PDFs in Quick Look.
- **Pane resize** – ⌘⇧ + arrows.
- **Pinned tabs** – ⌃⌘P or right-click → Pin keeps a tab first in its space, as an icon in the tab bar, and asks before closing it.
- **Arrow navigation** – ⌃⌘←/→ for the previous / next tab, ⌃⌘↑/↓ for the previous / next space; no [ ] keys, so they work on Italian and other layouts.
- **Focus veil** – panes you are not in fade a little.
- **⌃Tab switcher** – hold ⌃ and press Tab to walk your recent tabs across all spaces, release to go there; a quick ⌃Tab flips back.
- **Mission Control** – ⌘. or the grid button: every agent as a card on the frosted window, grouped by needs you / working / done / idle, filtered by space; click or ↩ to go there.
- **Palette** – Spotlight-style ⌘K / ⌘P search for tabs, spaces, agents and actions; rename, close, move tabs between spaces, resume parked terminals; sort tabs by status, recent use or name.
- **Launcher** – new tab with a terminal or an installed agent, in a recent folder (⌥1–5) or a new worktree.
- **Close dialog** – park a running agent instead of closing it.
- **Update notice** – the status bar tells you when a new C-Studio release is out; one click shows what's new and installs it.
- **Pane header and status bar** – folder, branch, ahead/behind with push and pull, quiet notifications.
- **Glass window** – frosted, translucent window frame with a light glass tab tray and spaces dock; terminals stay solid inside rounded pane cards.
- **Themes** – warm light and dark palettes; the focus border follows the space color.
- **Copilot CLI hooks** – report needs you only for a real permission prompt or a question to you.
- `install.sh` and `uninstall.sh`.
