import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import cron from "node-cron";
import { ROOT, SITE_DIR, ensureDirs, loadConfig } from "../core/config.ts";
import type { RunEvent } from "../core/events.ts";
import { buildGraph } from "../core/graph.ts";
import { makeProvider, providerAvailability, type ProviderName } from "../core/llm/select.ts";
import { Runner, computeIssueDate, listIssues, listRuns, loadRunState, runDir } from "../core/runner.ts";

/**
 * Dashboard API. Runs live in this process; each run's events are persisted to
 * data/runs/<id>/events.jsonl and fanned out to SSE subscribers.
 */

ensureDirs();
const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = Number(process.env.PORT ?? 8787);
const active = new Map<string, Runner>();
const subscribers = new Map<string, Set<express.Response>>();

function broadcast(e: RunEvent) {
  const subs = subscribers.get(e.runId);
  if (!subs) return;
  const payload = `data: ${JSON.stringify(e)}\n\n`;
  for (const res of subs) res.write(payload);
}

function resolveProvider(requested: string | undefined): { name: ProviderName; error?: string } {
  const a = providerAvailability();
  const name = (requested as ProviderName | undefined) ?? a.default;
  if (name === "api" && !a.api) return { name, error: "No Anthropic API key found. Set ANTHROPIC_API_KEY in .env, or choose the Claude Code provider (subscription login) or a mock run." };
  if (name === "claude-code" && !a.claudeCode) return { name, error: `Claude Code is not available: ${a.claudeCodeDetail}` };
  if (!["api", "claude-code", "mock"].includes(name)) return { name, error: `Unknown provider ${name}` };
  return { name };
}

function startRun(body: { issueDate?: string; deskIds?: string[]; provider?: string; mock?: boolean; autoPublish?: boolean; resume?: string }): Runner {
  const name: ProviderName = body.mock ? "mock" : ((body.provider as ProviderName | undefined) ?? providerAvailability().default);
  const runner = new Runner({
    runId: body.resume,
    resume: !!body.resume,
    issueDate: body.issueDate || (body.resume ? loadRunState(body.resume)?.issueDate : undefined),
    deskIds: body.deskIds?.length ? body.deskIds : undefined,
    mock: name === "mock",
    autoPublish: body.autoPublish ?? process.env.AUTO_PUBLISH === "true",
    provider: makeProvider(name),
    sink: broadcast,
  });
  active.set(runner.runId, runner);
  runner.run().finally(() => active.delete(runner.runId));
  return runner;
}

app.get("/api/config", (_req, res) => {
  const cfg = loadConfig();
  res.json({
    publication: { name: cfg.name, tagline: cfg.tagline, publisher: cfg.publisher, issue_weekday: cfg.issue_weekday },
    desks: cfg.desks,
    models: cfg.models,
    effort: cfg.effort,
    graph: buildGraph(cfg),
    nextIssueDate: computeIssueDate(),
    schedule: { enabled: process.env.SCHEDULE_ENABLED === "true", cron: process.env.SCHEDULE_CRON ?? "0 6 * * 5", tz: process.env.SCHEDULE_TZ ?? "America/New_York" },
    providers: providerAvailability(true),
    autoPublishDefault: process.env.AUTO_PUBLISH === "true",
  });
});

app.get("/api/runs", (_req, res) => res.json(listRuns()));

app.post("/api/runs", (req, res) => {
  try {
    const body = req.body ?? {};
    if (!body.mock) {
      const r = resolveProvider(body.provider);
      if (r.error) {
        res.status(400).json({ error: r.error });
        return;
      }
    }
    const runner = startRun(body);
    res.json({ runId: runner.runId, state: runner.state });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get("/api/runs/:id", (req, res) => {
  const live = active.get(req.params.id);
  const state = live?.state ?? loadRunState(req.params.id);
  if (!state) {
    res.status(404).json({ error: "run not found" });
    return;
  }
  res.json(state);
});

app.get("/api/runs/:id/events", (req, res) => {
  const id = req.params.id;
  const state = active.get(id)?.state ?? loadRunState(id);
  if (!state) {
    res.status(404).end();
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: "snapshot", runId: id, state })}\n\n`);
  const file = path.join(runDir(id), "events.jsonl");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) if (line) res.write(`data: ${line}\n\n`);
  }
  if (!subscribers.has(id)) subscribers.set(id, new Set());
  subscribers.get(id)!.add(res);
  const ping = setInterval(() => res.write(": ping\n\n"), 25000);
  req.on("close", () => {
    clearInterval(ping);
    subscribers.get(id)?.delete(res);
  });
});

app.post("/api/runs/:id/approve", (req, res) => {
  const r = active.get(req.params.id);
  if (!r) {
    res.status(404).json({ error: "run is not active; resume it first" });
    return;
  }
  r.approve();
  res.json({ ok: true });
});

app.post("/api/runs/:id/cancel", (req, res) => {
  const r = active.get(req.params.id);
  if (!r) {
    res.status(404).json({ error: "run is not active" });
    return;
  }
  r.cancel();
  res.json({ ok: true });
});

app.post("/api/runs/:id/resume", (req, res) => {
  if (active.has(req.params.id)) {
    res.status(409).json({ error: "run is already active" });
    return;
  }
  const prev = loadRunState(req.params.id);
  if (!prev) {
    res.status(404).json({ error: "run not found" });
    return;
  }
  if (!prev.mock) {
    const r = resolveProvider(prev.provider);
    if (r.error) {
      res.status(400).json({ error: r.error });
      return;
    }
  }
  const runner = startRun({ resume: prev.runId, mock: prev.mock, provider: prev.provider, autoPublish: req.body?.autoPublish ?? prev.autoPublish, deskIds: prev.deskIds });
  res.json({ runId: runner.runId });
});

app.get("/api/runs/:id/nodes/:nodeId", (req, res) => {
  const f = path.join(runDir(req.params.id), "nodes", req.params.nodeId.replace(":", "__") + ".json");
  if (!fs.existsSync(f)) {
    res.status(404).json({ error: "no output yet" });
    return;
  }
  res.type("json").send(fs.readFileSync(f, "utf8"));
});

app.get("/api/runs/:id/preview", (req, res) => {
  const f = path.join(runDir(req.params.id), "preview.html");
  if (!fs.existsSync(f)) {
    res.status(404).send("No preview rendered yet");
    return;
  }
  res.type("html").send(fs.readFileSync(f, "utf8"));
});

app.get("/api/issues", (_req, res) => {
  res.json(
    listIssues().map((i) => ({
      id: i.id, issue_number: i.issue_number, sample: i.sample, lead: i.front_page[0]?.headline ?? "", generated_at: i.generated_at, run_id: i.run_id,
      url: `/site/issues/${i.id}/`,
    })),
  );
});

app.use("/site", express.static(SITE_DIR));

const dist = path.join(ROOT, "dist", "dashboard");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*splat}", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/site")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Newsroom API on http://localhost:${PORT}${fs.existsSync(dist) ? " (dashboard served from dist/)" : " (run the Vite dev server for the dashboard)"}`);
  const a = providerAvailability();
  console.log(`Providers: claude-code ${a.claudeCode ? "ready (" + a.claudeCodeDetail + ")" : "unavailable"} · api ${a.api ? "ready" : "no key"} · default ${a.default}`);
  if (process.env.SCHEDULE_ENABLED === "true") {
    const expr = process.env.SCHEDULE_CRON ?? "0 6 * * 5";
    const tz = process.env.SCHEDULE_TZ ?? "America/New_York";
    cron.schedule(expr, () => {
      if (active.size) return;
      console.log("Scheduled run starting");
      startRun({ autoPublish: process.env.AUTO_PUBLISH === "true" });
    }, { timezone: tz });
    console.log(`Scheduler armed: "${expr}" (${tz})`);
  }
});
