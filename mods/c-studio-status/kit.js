// Shared by the C-Studio mods. Herdr only resolves imports inside a mod's own
// folder, so every mod keeps an identical copy: edit one, then run the repo's
// sync.sh, which refuses to continue while the copies differ.

import { run, panes, layout, shared, setShared, home, spaces, openOverlay, hc, exec } from "herdr";

export const SIDEBAR = { open: 296, peek: 56 };

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The Files / Changes side panel: which child is showing, or null when hidden.
export function panelShown() {
  const root = layout(), panel = find(root, "panel");
  if (!panel || panel.hidden) return null;
  return find(root, "panel-body")?.active ?? null;
}

export function showPanel(id) {
  if (id) { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
  else run("layout.hide", { id: "panel" });
}

export function togglePanel(id) {
  if (!find(layout(), "panel")) return;
  showPanel(panelShown() === id ? null : id);
}

export function pinDock(pinned) {
  setShared("dock.pinned", pinned);
  run("layout.resize", { id: "sidebar", px: pinned ? SIDEBAR.open : SIDEBAR.peek });
}

// A tab's label: its given name, else the agent session's title, else the
// program (nvim, htop…), and for a plain shell the folder it sits in.
export function tabName(tab, all = panes()) {
  const lead = all.find((p) => p.tab === tab.id && p.program?.agent) ?? all.find((p) => p.tab === tab.id);
  const program = lead?.program ?? null;
  if (tab.named) return { name: tab.name, program };
  if (program?.agent) return { name: lead.title && lead.title !== program.name ? lead.title : program.name, program };
  if (program && !program.shell) return { name: program.name, program };
  return { name: folderName(lead?.cwd) ?? program?.name ?? "Terminal", program };
}

export function folderName(path) {
  if (!path) return null;
  if (path === home()) return "~";
  return path.replace(/\/+$/, "").split("/").pop() || path;
}

// A plain terminal tab, in the given folder (default: the focused terminal's).
// Space colors as Herdr's picker keeps them (shared "space.colors"): a theme
// color name or #rrggbb per space id, new spaces getting the least used one.
export const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
export const SPACE_COLORS = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
export function spaceColor(t, space) {
  if (space.name === "~") return t.dim;
  const ids = new Set(spaces().map((p) => p.id));
  const stored = shared("space.colors") ?? {};
  const kept = Object.fromEntries(Object.entries(stored).filter(([id]) => ids.has(id)));
  let changed = Object.keys(kept).length !== Object.keys(stored).length;
  for (const p of spaces()) {
    if (kept[p.id] || p.name === "~") continue;
    const uses = (c) => Object.values(kept).filter((v) => v === c).length;
    kept[p.id] = SPACE_COLORS.reduce((best, c) => (uses(c) < uses(best) ? c : best));
    changed = true;
  }
  if (changed) setShared("space.colors", kept);
  const c = kept[space.id] ?? SPACE_COLORS[0];
  return c.startsWith("#") ? c : (MARK[c] ?? t[c]);
}

export function setSpaceColor(id, key) {
  setShared("space.colors", { ...(shared("space.colors") ?? {}), [id]: key });
}

export function newTerminal(space, folder) {
  run("tab.new", { space: space ?? undefined, folder: folder ?? undefined });
  dropPlaceholders(space);
}

// "New tab" launchers left only to keep a space open (see keepSpace) go once
// the space has a real tab again.
export async function dropPlaceholders(spaceId) {
  const id = spaceId ?? spaces().find((s) => s.active)?.id;
  const holder = (c, all) => { const mine = all.filter((p) => p.tab === c.id); return mine.length > 0 && mine.every((p) => p.mod === "c-studio-launch"); };
  for (let i = 0; i < 20; i++) {
    const space = spaces().find((s) => s.id === id);
    if (!space) return;
    const all = panes();
    const held = space.tabs.filter((c) => holder(c, all));
    if (!held.length) return;
    // Only once a real tab is there, or the space would close with its last one.
    if (held.length < space.tabs.length) { for (const c of held) run("tab.close", { id: c.id, confirmed: true }); return; }
    await pause();
  }
}

export function openLauncher(space, folder) {
  run("tab.new", { space: space ?? undefined, name: "New tab", mod: "c-studio-launch", props: { space: space ?? undefined, folder: folder ?? undefined } });
}

// What would stop if the tab closed: terminals running something other than a shell.
export function busyPanes(id, all = panes()) {
  return all.filter((p) => p.tab === id && p.terminal && p.program && !p.program.shell);
}

// Herdr closes a space when its last tab goes. Before that tab leaves (closed,
// parked or moved), leave a "New tab" launcher behind so the space stays; a
// space is closed only with its own ×. The launcher tab itself can still go.
export function keepSpace(tabId) {
  const space = spaces().find((s) => s.tabs.some((c) => c.id === tabId));
  if (!space || space.tabs.length > 1) return;
  if (!panes().some((p) => p.tab === tabId && p.terminal)) return;
  run("tab.new", { space: space.id, name: "New tab", mod: "c-studio-launch", props: { space: space.id, folder: space.folder ?? undefined }, focus: false });
}

// A plain shell closes at once; a running program or agent asks: park (keeps running) or close.
export function closeTab(id) {
  if (!id) return;
  if (!busyPanes(id).length) { keepSpace(id); return run("tab.close", { id }); }
  openOverlay({ mod: "c-studio-close", kind: "dialog", width: 440, height: 210, props: { tab: id } });
}

const pause = () => exec("sleep", ["0.15"]).catch(() => {});
const local = (id) => id.split("/").pop();

// Herdr can't move a tab to another space, but it shows a terminal where its
// herdr.space/herdr.tab labels say. So: park the terminals (the panes go, the
// programs keep running), relabel them to a fresh tab in the target space and
// keep them again; the name comes back with a rename. Mod panes stay behind.
export async function moveTab(tabId, spaceId) {
  const from = spaces().find((s) => s.tabs.some((c) => c.id === tabId));
  const to = spaces().find((s) => s.id === spaceId);
  const tab = from?.tabs.find((c) => c.id === tabId);
  if (!tab || !to || from.id === to.id || (from.machine ?? null) !== (to.machine ?? null)) return false;
  const terms = panes().filter((p) => p.tab === tabId && p.terminal).map((p) => p.terminal);
  if (!terms.length) return false;
  keepSpace(tabId);
  const fresh = "tb" + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  for (const t of terms) run("terminal.park", { terminal: t });
  for (const t of terms) {
    for (let i = 0; i < 40; i++) {
      const r = await hc(["get", t, "--json"]);
      if (r.code === 0 && JSON.parse(r.stdout).keep === false) break;
      await pause();
    }
    await hc(["label", t, `herdr.space=${local(to.id)}`, `herdr.tab=${fresh}`]);
    await hc(["keep", t]);
  }
  for (let i = 0; i < 40; i++) {
    const landed = panes().find((p) => p.terminal === terms[0]);
    if (landed) {
      if (tab.named) run("tab.rename", { id: landed.tab, name: tab.name });
      run("tab.select", { id: landed.tab });
      run("space.select", { id: to.id });
      return true;
    }
    await pause();
  }
  return false;
}
