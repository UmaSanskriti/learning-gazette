import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow, type NodeMouseHandler } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RunState } from "../core/runner.ts";
import { buildGraphFromConfig } from "./graphClient.ts";
import { api, type DashboardConfig } from "./client.ts";
import { AgentNode, fmtTokens } from "./components/AgentNode.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { toFlow, type AgentFlowNode } from "./layout.ts";
import { useRun } from "./useRun.ts";

const nodeTypes = { agent: AgentNode };

/** Re-fits the canvas whenever the run or the node set changes, so the graph is never stranded off-screen. */
function AutoFit({ runId, count }: { runId: string | null; count: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.06, duration: 250 }), 80);
    return () => clearTimeout(t);
  }, [runId, count, fitView]);
  return null;
}

function FitButton() {
  const { fitView } = useReactFlow();
  return <button className="btn" onClick={() => fitView({ padding: 0.06, duration: 250 })}>Fit view</button>;
}

export function App() {
  return (
    <ReactFlowProvider>
      <Newsroom />
    </ReactFlowProvider>
  );
}

function Newsroom() {
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [runs, setRuns] = useState<RunState[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [tick, setTick] = useState(0);
  const view = useRun(runId);

  const refreshRuns = useCallback(() => api.runs().then(setRuns).catch(() => {}), []);

  useEffect(() => {
    api.config().then(setConfig).catch((e) => console.error(e));
    api.runs()
      .then((rs) => {
        setRuns(rs);
        const live = rs.find((r) => r.status === "running" || r.status === "awaiting_approval");
        if (live) setRunId((cur) => cur ?? live.runId);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const running = view.state?.status === "running" || view.state?.status === "awaiting_approval";
    if (!running) return;
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [view.state?.status]);

  useEffect(() => {
    if (view.state?.status && view.state.status !== "running") refreshRuns();
  }, [view.state?.status, refreshRuns]);

  const graph = useMemo(() => {
    if (!config) return null;
    return view.state ? buildGraphFromConfig(config, view.state.deskIds) : config.graph;
  }, [config, view.state]);

  const flow = useMemo(() => (graph ? toFlow(graph, view.nodes, tick) : { nodes: [], edges: [] }), [graph, view.nodes, tick]);

  const onNodeClick: NodeMouseHandler<AgentFlowNode> = useCallback((_e, n) => setSelected(n.id), []);

  const start = async (body: { issueDate: string; deskIds: string[]; provider: "api" | "claude-code" | "mock"; mock: boolean; autoPublish: boolean }) => {
    setBusy(true);
    try {
      const { runId } = await api.start(body);
      setRunId(runId);
      setSelected(null);
      await refreshRuns();
    } finally {
      setBusy(false);
    }
  };

  const state = view.state;
  const totals = useMemo(() => {
    let tokens = 0, cost = 0;
    for (const n of Object.values(view.nodes)) {
      tokens += n.usage.input_tokens + n.usage.output_tokens;
      cost += n.costUsd;
    }
    return { tokens, cost };
  }, [view.nodes]);
  const done = Object.values(view.nodes).filter((n) => n.status === "done").length;
  const selectedNode = graph?.nodes.find((n) => n.id === selected) ?? null;

  if (!config) return <div className="empty"><div><h3>Connecting to the newsroom server…</h3>Start it with <code>npm run dev</code>.</div></div>;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">{config.publication.name}<span>Newsroom</span></div>
        {state && <span className={`pill ${state.status}`}>{state.status.replace("_", " ")}</span>}
        {state && <span className="note">issue {state.issueDate} · covering {state.windowStart} to {state.windowEnd} · {state.provider ?? (state.mock ? "mock" : "api")}</span>}
        <div className="stats">
          {state && <span>nodes <b>{done}/{graph?.nodes.length ?? 0}</b></span>}
          {totals.tokens > 0 && <span>tokens <b>{fmtTokens(totals.tokens)}</b></span>}
          {totals.cost > 0 && <span title={state?.provider === "claude-code" ? "What this run would cost at API list prices; on a subscription it counts against usage limits instead" : "Estimated API cost at list prices"}>{state?.provider === "claude-code" ? "list-price equiv." : "est. cost"} <b>${totals.cost.toFixed(2)}</b></span>}
          {state?.issueUrl && <a href={state.issueUrl} target="_blank" rel="noreferrer">Open published issue</a>}
          <a href="/site/" target="_blank" rel="noreferrer">Archive</a>
        </div>
      </header>

      <Sidebar config={config} runs={runs} activeRunId={runId} onSelect={setRunId} onStart={start} busy={busy} />

      <main className="canvas">
        {state?.status === "awaiting_approval" && (
          <div className="banner approval">
            <span>The issue is rendered and waiting for a club leader's approval.</span>
            <FitButton />
            <button className="btn" onClick={() => setPreview(true)}>Preview issue</button>
            <button className="btn accent" onClick={() => api.approve(state.runId).catch((e) => alert((e as Error).message))}>Approve and publish</button>
            <button className="btn danger" onClick={() => api.cancel(state.runId)}>Cancel</button>
          </div>
        )}
        {state?.status === "running" && (
          <div className="banner">
            <span className="spinner" style={{ display: "inline-block" }} />
            <span>Newsroom running · {Object.values(view.nodes).filter((n) => n.status === "running").length} agents active</span>
            <FitButton />
            {selected && <button className="btn" onClick={() => setSelected(null)}>All events</button>}
            {view.nodes["render"]?.status === "done" && <button className="btn" onClick={() => setPreview(true)}>Preview</button>}
            <button className="btn danger" onClick={() => api.cancel(state.runId)}>Cancel run</button>
          </div>
        )}
        {(state?.status === "failed" || state?.status === "cancelled") && (
          <div className="banner error">
            <span>Run {state.status}{state.error ? `: ${state.error}` : ""}</span>
            <button className="btn" onClick={() => api.resume(state.runId).then(() => { setRunId(null); setTimeout(() => setRunId(state.runId), 50); refreshRuns(); }).catch((e) => alert((e as Error).message))}>Resume from failed step</button>
            {view.nodes["render"]?.status === "done" && <button className="btn" onClick={() => setPreview(true)}>Preview</button>}
          </div>
        )}
        {state?.status === "done" && (
          <div className="banner">
            <span>Issue {state.issueId} published.</span>
            <button className="btn" onClick={() => setPreview(true)}>Preview</button>
            {state.issueUrl && <a className="btn primary" href={state.issueUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>Open published page</a>}
          </div>
        )}
        <ReactFlow<AgentFlowNode>
          nodes={flow.nodes}
          edges={flow.edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          onPaneClick={() => setSelected(null)}
          fitView
          fitViewOptions={{ padding: 0.06 }}
          minZoom={0.3}
          maxZoom={1.5}
          nodesConnectable={false}
          elementsSelectable
        >
          <AutoFit runId={runId} count={flow.nodes.length} />
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#cfc9b8" />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor={(n) => {
            const s = (n as AgentFlowNode).data.view?.status;
            return s === "done" ? "#6fb885" : s === "running" ? "#2a78d6" : s === "failed" ? "#b3261e" : "#b9b3a3";
          }} />
        </ReactFlow>
        {!state && (
          <div className="banner" style={{ top: "auto", bottom: 16, maxWidth: 720, textAlign: "center" }}>
            <span className="note" style={{ color: "var(--ink-2)" }}><strong style={{ color: "var(--ink)" }}>Ready to run.</strong> Each desk runs a collector, a verifier and a graphics editor; the editor-in-chief and columnist assemble the issue. Start a mock run to see it work without API credit.</span>
          </div>
        )}
      </main>

      <Inspector runId={runId} node={selectedNode} view={selected ? view.nodes[selected] : undefined} feed={view.feed} connected={view.connected} />

      {preview && runId && (
        <div className="modal" onClick={() => setPreview(false)}>
          <div className="frame" onClick={(e) => e.stopPropagation()}>
            <header>
              <strong>Issue preview</strong>
              <span className="note">Rendered from data/runs/{runId}/issue.json</span>
              <a className="btn" style={{ marginLeft: "auto", textDecoration: "none" }} href={`/api/runs/${runId}/preview`} target="_blank" rel="noreferrer">Open in new tab</a>
              <button className="btn" onClick={() => setPreview(false)}>Close</button>
            </header>
            <iframe title="Issue preview" src={`/api/runs/${runId}/preview`} />
          </div>
        </div>
      )}
    </div>
  );
}
