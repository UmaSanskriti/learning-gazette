import { useEffect, useReducer } from "react";
import type { LogKind, RunEvent } from "../core/events.ts";
import type { NodeState, RunState } from "../core/runner.ts";

export interface LogLine {
  at: string;
  kind: LogKind;
  text: string;
}

export interface NodeView extends NodeState {
  logs: LogLine[];
  lastActivity?: LogLine;
}

export interface FeedLine extends LogLine {
  nodeId: string;
}

export interface RunView {
  state: RunState | null;
  nodes: Record<string, NodeView>;
  /** Every log and status event across all nodes, oldest first, capped. */
  feed: FeedLine[];
  connected: boolean;
}

type Action = { type: "reset" } | { type: "connected"; value: boolean } | { type: "event"; event: RunEvent | { type: "snapshot"; runId: string; state: RunState } };

const MAX_LOGS = 600;

/** Turn the CLI's raw rate-limit JSON into one readable line, e.g. "rate limit: 5-hour window 22% used, resets 15:30 · weekly 16%". */
function prettifyRateLimit(text: string): string {
  if (!text.startsWith("rate limit notice:")) return text;
  try {
    const raw = text.slice("rate limit notice:".length).trim();
    const info = JSON.parse(raw.endsWith("}") ? raw : raw + "}") as { status?: string; unifiedWindows?: Record<string, { utilization?: number; resetsAt?: number }> };
    const w = info.unifiedWindows ?? {};
    const parts: string[] = [];
    const fmt = (k: string, label: string) => {
      const x = w[k];
      if (!x || typeof x.utilization !== "number") return;
      const reset = x.resetsAt ? new Date(x.resetsAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      parts.push(`${label} ${Math.round(x.utilization * 100)}% used${reset ? ", resets " + reset : ""}`);
    };
    fmt("five_hour", "5-hour window");
    fmt("seven_day", "weekly");
    return `rate limit (${info.status ?? "?"}): ${parts.join(" · ") || raw.slice(0, 120)}`;
  } catch {
    return text.slice(0, 160);
  }
}
const MAX_FEED = 2000;

function pushFeed(feed: FeedLine[], line: FeedLine): FeedLine[] {
  return feed.length >= MAX_FEED ? [...feed.slice(-MAX_FEED + 1), line] : [...feed, line];
}

function reducer(view: RunView, action: Action): RunView {
  switch (action.type) {
    case "reset":
      return { state: null, nodes: {}, feed: [], connected: false };
    case "connected":
      return { ...view, connected: action.value };
    case "event": {
      const e = action.event;
      if (e.type === "snapshot") {
        const nodes: Record<string, NodeView> = {};
        for (const [id, n] of Object.entries(e.state.nodes)) nodes[id] = { ...n, logs: view.nodes[id]?.logs ?? [] };
        return { ...view, state: e.state, nodes };
      }
      if (!view.state) return view;
      const nodes = { ...view.nodes };
      const get = (id: string): NodeView => nodes[id] ?? { status: "idle", usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, costUsd: 0, logs: [] };
      switch (e.type) {
        case "run:started":
          return { ...view, state: { ...view.state, status: "running" } };
        case "node:status": {
          const n = get(e.nodeId);
          const startedAt = e.status === "running" && !n.startedAt ? e.at : n.startedAt;
          const endedAt = e.status === "done" || e.status === "failed" ? e.at : n.endedAt;
          nodes[e.nodeId] = { ...n, status: e.status, error: e.error ?? n.error, startedAt, endedAt };
          const status = e.status === "awaiting_approval" ? "awaiting_approval" : view.state.status === "awaiting_approval" && e.status === "running" ? "running" : view.state.status;
          const feed = ["running", "done", "failed", "awaiting_approval"].includes(e.status)
            ? pushFeed(view.feed, { nodeId: e.nodeId, at: e.at, kind: e.status === "failed" ? "error" : "info", text: `status: ${e.status}${e.error ? " · " + e.error : ""}` })
            : view.feed;
          return { ...view, nodes, feed, state: { ...view.state, status } };
        }
        case "node:log": {
          const n = get(e.nodeId);
          const line = { at: e.at, kind: e.kind, text: e.kind === "warn" ? prettifyRateLimit(e.text) : e.text };
          if (e.kind === "warn" && n.logs.length && n.logs[n.logs.length - 1].text === line.text) return view;
          const logs = n.logs.length >= MAX_LOGS ? [...n.logs.slice(-MAX_LOGS + 1), line] : [...n.logs, line];
          nodes[e.nodeId] = { ...n, logs, lastActivity: e.kind === "thinking" && n.lastActivity?.kind === "search" ? n.lastActivity : line };
          return { ...view, nodes, feed: pushFeed(view.feed, { nodeId: e.nodeId, ...line }) };
        }
        case "node:usage": {
          const n = get(e.nodeId);
          nodes[e.nodeId] = { ...n, usage: e.usage, model: e.model };
          return { ...view, nodes };
        }
        case "node:output": {
          const n = get(e.nodeId);
          nodes[e.nodeId] = { ...n, summary: e.summary };
          return { ...view, nodes, feed: pushFeed(view.feed, { nodeId: e.nodeId, at: e.at, kind: "result", text: e.summary }) };
        }
        case "run:issue":
          return { ...view, state: { ...view.state, issueId: e.issueId, issueUrl: e.url } };
        case "run:finished":
          return { ...view, state: { ...view.state, status: e.status, error: e.error, endedAt: e.at }, feed: pushFeed(view.feed, { nodeId: "run", at: e.at, kind: e.status === "done" ? "result" : "error", text: `run ${e.status}${e.error ? ": " + e.error : ""}` }) };
      }
      return view;
    }
  }
}

/** Subscribes to a run's event stream and folds it into a view the canvas can render. */
export function useRun(runId: string | null): RunView {
  const [view, dispatch] = useReducer(reducer, { state: null, nodes: {}, feed: [], connected: false });
  useEffect(() => {
    dispatch({ type: "reset" });
    if (!runId) return;
    const es = new EventSource(`/api/runs/${runId}/events`);
    es.onopen = () => dispatch({ type: "connected", value: true });
    es.onmessage = (m) => dispatch({ type: "event", event: JSON.parse(m.data) });
    es.onerror = () => dispatch({ type: "connected", value: false });
    return () => es.close();
  }, [runId]);
  return view;
}
