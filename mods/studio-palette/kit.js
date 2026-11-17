// Shared by the Studio mods. Herdr only resolves imports inside a mod's own
// folder, so every mod keeps an identical copy: edit one, then run the repo's
// sync.sh, which refuses to continue while the copies differ.

import { run, panes, layout, setShared } from "herdr";

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

// A tab's label: its given name, else the agent session's title, else the program.
export function tabName(tab, all = panes()) {
  const lead = all.find((p) => p.tab === tab.id && p.program?.agent) ?? all.find((p) => p.tab === tab.id);
  const program = lead?.program ?? null;
  const session = program?.agent && lead.title && lead.title !== program.name ? lead.title : null;
  return { name: tab.named ? tab.name : session ?? program?.name ?? "Terminal", program };
}

// A plain terminal tab, in the given folder (default: the focused terminal's).
export function newTerminal(space, folder) {
  run("tab.new", { space: space ?? undefined, folder: folder ?? undefined });
}

export function openLauncher(space, folder) {
  run("tab.new", { space: space ?? undefined, name: "New tab", mod: "studio-launch", props: { space: space ?? undefined, folder: folder ?? undefined } });
}
