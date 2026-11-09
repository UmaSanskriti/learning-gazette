import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AgentFlowNode } from "../layout.ts";

const GLYPH: Record<string, string> = { trigger: "GO", plan: "PL", collector: "C", verifier: "V", graphics: "G", editor: "ED", columnist: "W", render: "R", publish: "P" };

export function elapsed(startedAt?: string, endedAt?: string, now = Date.now()): string {
  if (!startedAt) return "";
  const ms = (endedAt ? new Date(endedAt).getTime() : now) - new Date(startedAt).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export function AgentNode({ data, selected }: NodeProps<AgentFlowNode>) {
  const { node, view } = data;
  const status = view?.status ?? "idle";
  const isFirst = node.kind === "trigger";
  const isLast = node.kind === "publish";
  const tokens = view ? view.usage.input_tokens + view.usage.output_tokens : 0;
  const act = view?.lastActivity;
  const statusText =
    status === "running" ? elapsed(view?.startedAt) :
    status === "done" ? `${elapsed(view?.startedAt, view?.endedAt)}${tokens ? ` · ${fmtTokens(tokens)} tok` : ""}` :
    status === "queued" ? "queued" :
    status === "failed" ? "failed" :
    status === "awaiting_approval" ? "needs approval" : node.model ? node.model.replace("claude-", "") : "";
  return (
    <div className={`agent-node ${status} ${selected ? "selected" : ""}`}>
      {!isFirst && <Handle type="target" position={Position.Left} id="in" />}
      {!isFirst && <Handle type="target" position={Position.Top} id="in-top" />}
      <div className="head">
        <div className="glyph">{GLYPH[node.kind] ?? "·"}</div>
        <div className="titles">
          <div className="label">{node.label}</div>
          <div className="sub">{node.sublabel}</div>
        </div>
      </div>
      <div className="status">
        <span>{status === "running" && <span className="spinner" />}{statusText}</span>
        {status === "done" && view?.costUsd ? <span>${view.costUsd.toFixed(2)}</span> : null}
      </div>
      <div className="activity" title={act?.text}>
        {status === "done" && view?.summary ? view.summary : act ? (<><span className="k">{act.kind}</span>{act.text.split("\n")[0]}</>) : node.description.split(".")[0]}
      </div>
      {!isLast && <Handle type="source" position={Position.Right} id="out" />}
      {!isLast && <Handle type="source" position={Position.Bottom} id="out-bottom" />}
    </div>
  );
}
