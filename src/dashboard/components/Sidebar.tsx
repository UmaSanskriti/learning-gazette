import { useState } from "react";
import type { RunState } from "../../core/runner.ts";
import type { DashboardConfig } from "../client.ts";

interface Props {
  config: DashboardConfig;
  runs: RunState[];
  activeRunId: string | null;
  onSelect: (id: string) => void;
  onStart: (body: { issueDate: string; deskIds: string[]; provider: "api" | "claude-code" | "mock"; mock: boolean; autoPublish: boolean }) => Promise<void>;
  busy: boolean;
}

export function Sidebar({ config, runs, activeRunId, onSelect, onStart, busy }: Props) {
  const [issueDate, setIssueDate] = useState(config.nextIssueDate);
  const [desks, setDesks] = useState<string[]>(config.desks.map((d) => d.id));
  const [provider, setProvider] = useState<"api" | "claude-code" | "mock">(config.providers.default);
  const mock = provider === "mock";
  const [autoPublish, setAutoPublish] = useState(config.autoPublishDefault);
  const [error, setError] = useState("");
  const toggle = (id: string) => setDesks((ds) => (ds.includes(id) ? ds.filter((x) => x !== id) : [...ds, id]));

  return (
    <aside className="sidebar">
      <section>
        <h2>New issue</h2>
        <div className="field">
          <label htmlFor="issue-date">Issue date (Friday)</label>
          <input id="issue-date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Desks</label>
          <div className="checks">
            {config.desks.map((d) => (
              <label key={d.id}><input type="checkbox" checked={desks.includes(d.id)} onChange={() => toggle(d.id)} />{d.name}</label>
            ))}
          </div>
          <div className="btn-row" style={{ marginTop: 6 }}>
            <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => setDesks(config.desks.map((d) => d.id))}>All</button>
            <button className="btn" style={{ padding: "3px 8px", fontSize: 11 }} onClick={() => setDesks([])}>None</button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="provider">Runs on</label>
          <select id="provider" value={provider} onChange={(e) => setProvider(e.target.value as "api" | "claude-code" | "mock")}>
            <option value="claude-code" disabled={!config.providers.claudeCode}>Claude subscription via Claude Code{config.providers.claudeCode ? "" : " (not logged in)"}</option>
            <option value="api" disabled={!config.providers.api}>Anthropic API key{config.providers.api ? "" : " (no key)"}</option>
            <option value="mock">Mock (no model calls, sample content)</option>
          </select>
          {provider === "claude-code" && <p className="note">Uses the claude.ai login on this machine ({config.providers.claudeCodeDetail}). Counts against your subscription's usage limits, not API credit.</p>}
        </div>
        <label className="toggle"><input type="checkbox" checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)} />Publish without approval</label>
        {!mock && <p className="note">A full run makes about {desks.length * 3 + 2} agent sessions with web search. Expect {provider === "claude-code" ? "45 to 90 minutes, and start with a few desks on a Pro plan" : "20 to 40 minutes"}.</p>}
        {error && <p className="note warn">{error}</p>}
        <button
          className="btn primary"
          disabled={busy || desks.length === 0}
          onClick={async () => {
            setError("");
            try {
              await onStart({ issueDate, deskIds: desks, provider, mock, autoPublish });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {busy ? "Starting…" : "Run newsroom"}
        </button>
      </section>
      <section>
        <h2>Schedule</h2>
        <p className="note">
          {config.schedule.enabled ? `Server cron armed: ${config.schedule.cron} (${config.schedule.tz}).` : "Server cron is off (set SCHEDULE_ENABLED=true in .env)."}
          {" "}The GitHub Action in .github/workflows runs every Friday regardless of who is online.
        </p>
      </section>
      <section>
        <h2>Runs</h2>
        {runs.length === 0 && <p className="note">No runs yet.</p>}
        <ul className="runs">
          {runs.map((r) => (
            <li key={r.runId} className={r.runId === activeRunId ? "active" : ""} onClick={() => onSelect(r.runId)}>
              <div>
                <div className="id">{r.runId}</div>
                <div className="sub">{r.provider ?? (r.mock ? "mock" : "api")} · {r.deskIds.length} desks{r.totalCostUsd ? ` · $${r.totalCostUsd.toFixed(2)}${r.provider === "claude-code" ? " list" : ""}` : ""}</div>
              </div>
              <span className={`pill ${r.status}`}>{r.status.replace("_", " ")}</span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
