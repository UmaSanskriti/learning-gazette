import type { DeskConfig, PublicationConfig, Role } from "./config.ts";

export type NodeKind = "trigger" | "plan" | Role | "render" | "publish";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  sublabel: string;
  description: string;
  deskId?: string;
  deps: string[];
  model?: string;
  effort?: string;
  /** Column and row hints for the dashboard layout. */
  col: number;
  row: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const nodeIds = {
  collector: (d: string) => `collector:${d}`,
  verifier: (d: string) => `verifier:${d}`,
  graphics: (d: string) => `graphics:${d}`,
};

/** Build the pipeline DAG for the selected desks. Desks fan out across columns 1 to 3; the trigger and plan stack in column 0 and the editorial chain stacks in column 4. */
export function buildGraph(cfg: PublicationConfig, deskIds?: string[]): Graph {
  const desks: DeskConfig[] = cfg.desks.filter((d) => !deskIds || deskIds.includes(d.id));
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const middleRow = Math.max(0, (desks.length - 1) / 2);

  nodes.push({
    id: "trigger", kind: "trigger", label: "Weekly trigger", sublabel: "Friday · manual or cron",
    description: "Starts a run. Fired by the dashboard, the CLI, the built-in scheduler or the GitHub Action.", deps: [], col: 0, row: middleRow - 0.5,
  });
  nodes.push({
    id: "plan", kind: "plan", label: "Plan issue", sublabel: "coverage window · desks",
    description: "Computes the coverage window, loads editorial memory and briefs the desks. No model call.", deps: ["trigger"], col: 0, row: middleRow + 0.5,
  });
  edges.push({ id: "e:trigger-plan", source: "trigger", target: "plan" });

  const lastOfDesk: string[] = [];
  desks.forEach((desk, row) => {
    const c = nodeIds.collector(desk.id);
    const v = nodeIds.verifier(desk.id);
    nodes.push({
      id: c, kind: "collector", label: desk.name, sublabel: "Collector", deskId: desk.id, deps: ["plan"],
      model: cfg.models.collector, effort: cfg.effort.collector, col: 1, row,
      description: `Searches the web for this week's candidate items. ${desk.summary}`,
    });
    edges.push({ id: `e:plan-${c}`, source: "plan", target: c });
    nodes.push({
      id: v, kind: "verifier", label: desk.name, sublabel: desk.kind === "opportunities" ? "Verifier · deadlines" : "Verifier · accuracy, tone", deskId: desk.id, deps: [c],
      model: cfg.models.verifier, effort: cfg.effort.verifier, col: 2, row,
      description: "Opens the cited sources, confirms claims, labels evidence, edits to house voice, drops what cannot be verified.",
    });
    edges.push({ id: `e:${c}-${v}`, source: c, target: v });
    let last = v;
    if (desk.graphics) {
      const g = nodeIds.graphics(desk.id);
      nodes.push({
        id: g, kind: "graphics", label: desk.name, sublabel: "Graphics", deskId: desk.id, deps: [v],
        model: cfg.models.graphics, effort: cfg.effort.graphics, col: 3, row,
        description: "Proposes charts, timelines, diagrams and key numbers only where they communicate information, with cited data.",
      });
      edges.push({ id: `e:${v}-${g}`, source: v, target: g });
      last = g;
    }
    lastOfDesk.push(last);
  });

  nodes.push({
    id: "editor", kind: "editor", label: "Editor-in-chief", sublabel: "front page · brief · QA", deps: lastOfDesk,
    model: cfg.models.editor, effort: cfg.effort.editor, col: 4, row: middleRow - 1.5,
    description: "Selects the front page, writes the executive brief and Company Watch, removes duplicates and files the QA report.",
  });
  for (const l of lastOfDesk) edges.push({ id: `e:${l}-editor`, source: l, target: "editor" });
  nodes.push({
    id: "columnist", kind: "columnist", label: "Columnist", sublabel: "editorial · research · glossary", deps: ["editor"],
    model: cfg.models.columnist, effort: cfg.effort.columnist, col: 4, row: middleRow - 0.5,
    description: "Writes the editorial, Paper of the Week, Cognitive Science Corner, Builder's Corner and glossary.",
  });
  edges.push({ id: "e:editor-columnist", source: "editor", target: "columnist" });
  nodes.push({
    id: "render", kind: "render", label: "Render issue", sublabel: "JSON → HTML + SVG", deps: ["columnist"], col: 4, row: middleRow + 0.5,
    description: "Assembles the issue JSON and renders the newspaper page with inline SVG visuals. No model call.",
  });
  edges.push({ id: "e:columnist-render", source: "columnist", target: "render" });
  nodes.push({
    id: "publish", kind: "publish", label: "Publish", sublabel: "docs/ · archive · memory", deps: ["render"], col: 4, row: middleRow + 1.5,
    description: "Waits for approval (unless auto-publish), then writes the issue to docs/, updates the archive and editorial memory.",
  });
  edges.push({ id: "e:render-publish", source: "render", target: "publish" });

  return { nodes, edges };
}

export function topoOrder(graph: Graph): string[] {
  const done = new Set<string>();
  const order: string[] = [];
  let progress = true;
  while (progress && order.length < graph.nodes.length) {
    progress = false;
    for (const n of graph.nodes) {
      if (done.has(n.id)) continue;
      if (n.deps.every((d) => done.has(d))) {
        done.add(n.id);
        order.push(n.id);
        progress = true;
      }
    }
  }
  if (order.length !== graph.nodes.length) throw new Error("Graph has a cycle");
  return order;
}
