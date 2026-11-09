import type { Edge, Node } from "@xyflow/react";
import type { Graph, GraphNode } from "../core/graph.ts";
import type { NodeView } from "./useRun.ts";

export type AgentNodeData = { node: GraphNode; view?: NodeView; tick: number };
export type AgentFlowNode = Node<AgentNodeData, "agent">;

const COL_W = 290;
const ROW_H = 118;

export function toFlow(graph: Graph, views: Record<string, NodeView>, tick: number): { nodes: AgentFlowNode[]; edges: Edge[] } {
  const nodes: AgentFlowNode[] = graph.nodes.map((n) => ({
    id: n.id,
    type: "agent",
    position: { x: n.col * COL_W, y: n.row * ROW_H },
    data: { node: n, view: views[n.id], tick },
    draggable: true,
    connectable: false,
  }));
  const col = new Map(graph.nodes.map((n) => [n.id, n.col]));
  const edges: Edge[] = graph.edges.map((e) => {
    const vertical = col.get(e.source) === col.get(e.target);
    const src = views[e.source]?.status;
    const tgt = views[e.target]?.status;
    const active = tgt === "running" || tgt === "queued" || tgt === "awaiting_approval";
    const done = src === "done" && tgt === "done";
    return {
      id: e.id, source: e.source, target: e.target, type: "smoothstep", animated: active, className: active ? "active" : done ? "done" : "",
      sourceHandle: vertical ? "out-bottom" : "out", targetHandle: vertical ? "in-top" : "in",
    };
  });
  return { nodes, edges };
}
