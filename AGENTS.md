# AGENTS.md

Guidance for coding agents working on C-Studio, a calm, macOS-style layout for
[Herdr.app](https://herdr.app) (`herdr-app`).

## Where the work happens

- Edit the **live files** in `~/.config/herdr-app` (`mods/c-studio-*`, `layouts/c-studio*.json`,
  `themes/c-studio-*.json`, `keys.json`). Herdr reloads them as you save.
- This repo is a copy. Bring changes back with `./sync.sh` only when the change is accepted;
  never edit `mods/`, `layouts/` or `themes/` here by hand.
- `~/.config/herdr-app/AGENTS.md` is Herdr's own manual for mods (APIs, commands, limits):
  read it before writing mod code.

## Loop

1. Edit the live file.
2. `herdr-app check mods/<mod>` (from `~/.config/herdr-app`) for every mod you touched, and
   `herdr-app status` must report `"errors": []`.
3. When it changes what you see, check it with `herdr-app shot <file.png>`; delete screenshots
   afterwards (they show real session titles).
4. Let the person try it. Visual changes are iterated with them; don't commit before they agree.
5. `./sync.sh`, update `README.md`, `RECIPE.md` (look and motion values) and `CHANGELOG.md` when
   the change is user-visible, then commit and push to `main`.

## Rules that are easy to break

- **No imports across mods.** Herdr rejects paths and symlinks outside a mod's folder, so:
  - `kit.js` is shared code copied **identically** into c-studio-close, dock, menu, palette,
    status, switch and tabs. Change all copies together; `sync.sh` refuses to run if they differ.
  - Mods without `kit.js` (e.g. c-studio-mc) keep small local copies of what they need
    (`glass()`, icon drawing, title cleanup) — keep them in step with `kit.js`.
  - `c-studio-files` / `c-studio-changes` extend Herdr's built-in mods through a `base.js` copy.
    `base.js` is excluded from the repo; `install.sh` creates it from the installed Herdr.
- **Themes:** edit only `c-studio-dark.json` / `c-studio-light.json`. `sync.sh` regenerates the
  six accent variants of each from them; new colors (like `studio-glass`) go in the base themes.
- **Glass:** panels use the theme color `studio-glass` (90% frame opacity; the light theme is more opaque, or it goes grey over a dark desktop); terminals use
  `terminal_opacity: 0` with no pane background. Don't put a background back on panes.
- **Motion:** quiet and consistent — fades 280 ms `ease-out`, Mission Control 260 ms in /
  180 ms out, opacity only (no sliding). Transitions work only on opacity, width, height, left
  and top (`top` needs `.relative()`). See `RECIPE.md` before adding new motion.
- **Herdr 0.1.18 quirk:** `tab.move` ignores `id` and moves the active tab. Use
  `reorderTab(id, index)` from `kit.js`, never `run("tab.move", { id, … })`.
- **Icons:** program SVGs are drawn in one color (`programIcon()` in `kit.js`); only pictures keep
  their colors.
- **Selection style:** in the Spaces dock the selected tab has icon and name in the space color on
  a faint pill; Mission Control cards stay neutral (grey at rest, bright when selected) with a
  status bar on the left.

## Writing

- Comments explain *why*, in plain English, only where the code isn't obvious.
- Shortcut text in docs: macOS symbols are fine in README tables, but when talking to a person
  write modifiers in words (ctrl, cmd, alt, shift).
- Commit messages: short imperative subject, a body that says what changed for the user, and the
  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>` trailer.
