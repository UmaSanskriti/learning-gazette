import type { Graph } from "../core/graph.ts";
import type { DashboardConfig } from "./client.ts";

/**
 * The server's graph covers every desk. A run may have used a subset, so the
 * canvas filters the graph down to the desks the run actually included and
 * re-packs the rows so the layout stays compact.
 */
export function buildGraphFromConfig(config: DashboardConfig, deskIds: string[]): Graph {
  const keep = new Set(deskIds);
  const nodes = config.graph.nodes.filter((n) => !n.deskId || keep.has(n.deskId));
  const ids = new Set(nodes.map((n) => n.id));
  const rows = [...new Set(nodes.filter((n) => n.deskId).map((n) => n.row))].sort((a, b) => a - b);
  const rowMap = new Map(rows.map((r, i) => [r, i]));
  const oldMiddle = Math.max(0, (config.desks.length - 1) / 2);
  const newMiddle = Math.max(0, (rows.length - 1) / 2);
  const remapped = nodes.map((n) => ({
    ...n,
    row: n.deskId ? rowMap.get(n.row) ?? 0 : n.row - oldMiddle + newMiddle,
    deps: n.deps.filter((d) => ids.has(d)),
  }));
  const edges = config.graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  return { nodes: remapped, edges };
}
