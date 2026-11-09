import { useEffect, useRef, useState } from "react";
import type { GraphNode } from "../../core/graph.ts";
import { api } from "../client.ts";
import type { FeedLine, NodeView } from "../useRun.ts";
import { elapsed, fmtTokens } from "./AgentNode.tsx";

function RunFeed({ feed, connected, hasRun }: { feed: FeedLine[]; connected: boolean; hasRun: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);
  const [quiet, setQuiet] = useState(true);
  const shown = quiet ? feed.filter((l) => l.kind !== "thinking" && l.kind !== "text") : feed;
  useEffect(() => {
    if (stick && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [shown.length, stick]);
  return (
    <aside className="inspector">
      <div className="head">
        <h3>Run feed</h3>
        <p className="desc">
          {hasRun ? "Every search, fetch, status change and result across all agents, live. Click a node on the canvas for that agent alone." : "Select a run on the left, or start one, to watch its events here."}
        </p>
        {hasRun && (
          <label className="toggle" style={{ marginTop: 8 }}>
            <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} />Hide drafting and thinking lines
          </label>
        )}
        {hasRun && <p className="note" style={{ marginTop: 4 }}>{connected ? "Live connection open" : "Reconnecting to the event stream…"} · {feed.length} events</p>}
      </div>
      <div className="log" ref={ref} onScroll={(e) => { const el = e.currentTarget; setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 40); }}>
        {shown.length ? shown.map((l, i) => (
          <div className={`line ${l.kind}`} key={i}>
            <span className="t">{l.at.slice(11, 19)}</span>
            <span className="k node">{l.nodeId}</span>
            <span className={`k ${l.kind}`}>{l.kind}</span>
            {l.text}
          </div>
        )) : <span style={{ color: "var(--ink-3)" }}>{hasRun ? "Waiting for the first events…" : ""}</span>}
      </div>
    </aside>
  );
}

export function Inspector({ runId, node, view, feed, connected }: { runId: string | null; node: GraphNode | null; view?: NodeView; feed: FeedLine[]; connected: boolean }) {
  const [tab, setTab] = useState<"log" | "output">("log");
  const [output, setOutput] = useState<string>("");
  const logRef = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState(true);

  useEffect(() => {
    setTab("log");
    setOutput("");
  }, [node?.id, runId]);

  useEffect(() => {
    if (tab !== "output" || !runId || !node) return;
    api.nodeOutput(runId, node.id).then((o) => setOutput(JSON.stringify(o, null, 2))).catch((e) => setOutput(`(${(e as Error).message})`));
  }, [tab, runId, node, view?.status]);

  useEffect(() => {
    if (stick && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [view?.logs.length, stick]);

  if (!node) return <RunFeed feed={feed} connected={connected} hasRun={!!runId} />;
  const status = view?.status ?? "idle";
  const tokens = view ? view.usage : null;
  return (
    <aside className="inspector">
      <div className="head">
        <span className={`pill ${status}`}>{status.replace("_", " ")}</span>
        <h3 style={{ marginTop: 8 }}>{node.label} <span style={{ color: "var(--ink-3)", fontWeight: 400 }}>· {node.sublabel}</span></h3>
        <p className="desc">{node.description}</p>
        <dl className="kv">
          {node.model && <><dt>Model</dt><dd>{view?.model ?? node.model} · effort {node.effort}</dd></>}
          {view?.startedAt && <><dt>Time</dt><dd>{elapsed(view.startedAt, view.endedAt)}</dd></>}
          {tokens && (tokens.input_tokens || tokens.output_tokens) ? (
            <><dt>Tokens</dt><dd>{fmtTokens(tokens.input_tokens)} in · {fmtTokens(tokens.output_tokens)} out · {fmtTokens(tokens.cache_read_input_tokens)} cached · est. ${view?.costUsd.toFixed(2)}</dd></>
          ) : null}
          {view?.summary && <><dt>Result</dt><dd>{view.summary}</dd></>}
          {view?.error && <><dt>Error</dt><dd style={{ color: "var(--err)" }}>{view.error}</dd></>}
        </dl>
      </div>
      <div className="tabs">
        <button className={tab === "log" ? "on" : ""} onClick={() => setTab("log")}>Live log{view?.logs.length ? ` (${view.logs.length})` : ""}</button>
        <button className={tab === "output" ? "on" : ""} onClick={() => setTab("output")} disabled={status !== "done"}>Output</button>
      </div>
      {tab === "log" ? (
        <div className="log" ref={logRef} onScroll={(e) => { const el = e.currentTarget; setStick(el.scrollHeight - el.scrollTop - el.clientHeight < 40); }}>
          {view?.logs.length ? view.logs.map((l, i) => (
            <div className={`line ${l.kind}`} key={i}><span className="t">{l.at.slice(11, 19)}</span><span className={`k ${l.kind}`}>{l.kind}</span>{l.text}</div>
          )) : <span style={{ color: "var(--ink-3)" }}>No activity yet.</span>}
        </div>
      ) : (
        <div className="output">{output || "Loading…"}</div>
      )}
    </aside>
  );
}
