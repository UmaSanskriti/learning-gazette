import fs from "node:fs";
import path from "node:path";
import { assembleIssue, type DeskResults } from "./assemble.ts";
import {
  ISSUES_DIR, RUNS_DIR, SITE_DIR, ensureDirs, loadConfig, loadMemory, saveMemory, type PublicationConfig,
} from "./config.ts";
import { addUsage, emptyUsage, estimateCostUsd, type EventSink, type LogKind, type NodeStatus, type RunEvent, type Usage } from "./events.ts";
import { buildGraph, topoOrder, type Graph, type GraphNode } from "./graph.ts";
import type { Provider } from "./llm/provider.ts";
import { collectorRequest, columnistRequest, editorRequest, graphicsRequest, verifierRequest, type RunContext } from "./agents/prompts.ts";
import { Issue, type ColumnistOutput, type EditorOutput, type GraphicsOutput, type OpportunityDeskOutput, type VerifierOutput } from "./schema.ts";
import { renderArchiveHtml, renderIssueHtml } from "./render/index.ts";

export interface RunOptions {
  runId?: string;
  /** Issue date (the Friday). Defaults to the coming Friday, or today if today is Friday. */
  issueDate?: string;
  deskIds?: string[];
  mock: boolean;
  autoPublish: boolean;
  resume?: boolean;
  concurrency?: number;
  provider: Provider;
  sink?: EventSink;
}

export interface NodeState {
  status: NodeStatus;
  startedAt?: string;
  endedAt?: string;
  error?: string;
  usage: Usage;
  model?: string;
  costUsd: number;
  summary?: string;
}

export interface RunState {
  runId: string;
  status: "running" | "done" | "failed" | "cancelled" | "awaiting_approval";
  issueDate: string;
  windowStart: string;
  windowEnd: string;
  mock: boolean;
  provider: string;
  autoPublish: boolean;
  deskIds: string[];
  startedAt: string;
  endedAt?: string;
  nodes: Record<string, NodeState>;
  issueId?: string;
  issueUrl?: string;
  error?: string;
  totalUsage: Usage;
  totalCostUsd: number;
}

export function computeIssueDate(from = new Date()): string {
  const d = new Date(from);
  const day = d.getDay(); // 5 = Friday
  const delta = (5 - day + 7) % 7;
  d.setDate(d.getDate() + delta);
  return iso(d);
}

export function computeWindow(issueDate: string): { windowStart: string; windowEnd: string } {
  const end = new Date(issueDate + "T12:00:00");
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return { windowStart: iso(start), windowEnd: iso(end) };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function newRunId(issueDate: string): string {
  const t = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  return `${issueDate}_${t}`;
}

export function runDir(runId: string): string {
  return path.join(RUNS_DIR, runId);
}

export function loadRunState(runId: string): RunState | null {
  const f = path.join(runDir(runId), "run.json");
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf8")) as RunState;
}

export function listRuns(): RunState[] {
  if (!fs.existsSync(RUNS_DIR)) return [];
  return fs
    .readdirSync(RUNS_DIR)
    .map((id) => loadRunState(id))
    .filter((r): r is RunState => !!r)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

export function listIssues(): Issue[] {
  if (!fs.existsSync(ISSUES_DIR)) return [];
  return fs
    .readdirSync(ISSUES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(ISSUES_DIR, f), "utf8")) as Issue)
    .sort((a, b) => (a.id < b.id ? 1 : -1));
}

/**
 * Executes the pipeline DAG. Each node's output is persisted so a failed run
 * can be resumed without re-paying for finished agents. Events are appended to
 * events.jsonl and forwarded to the sink (the server streams them over SSE).
 */
export class Runner {
  readonly cfg: PublicationConfig;
  readonly graph: Graph;
  readonly state: RunState;
  private ctx: RunContext;
  private outputs = new Map<string, unknown>();
  private abort = new AbortController();
  private approval: { promise: Promise<void>; resolve: () => void } | null = null;
  private sink: EventSink;
  private opts: RunOptions;
  private semaphore: Semaphore;

  constructor(opts: RunOptions) {
    ensureDirs();
    this.opts = opts;
    this.cfg = loadConfig();
    const issueDate = opts.issueDate ?? computeIssueDate();
    const { windowStart, windowEnd } = computeWindow(issueDate);
    const runId = opts.runId ?? newRunId(issueDate);
    const deskIds = opts.deskIds ?? this.cfg.desks.map((d) => d.id);
    this.graph = buildGraph(this.cfg, deskIds);
    const existing = opts.resume ? loadRunState(runId) : null;
    this.state = existing ?? {
      runId, status: "running", issueDate, windowStart, windowEnd, mock: opts.mock, provider: opts.provider.name, autoPublish: opts.autoPublish, deskIds,
      startedAt: new Date().toISOString(), nodes: {}, totalUsage: emptyUsage(), totalCostUsd: 0,
    };
    this.state.status = "running";
    this.state.error = undefined;
    this.state.provider = opts.provider.name;
    for (const n of this.graph.nodes) {
      const prev = this.state.nodes[n.id];
      const keep = opts.resume && prev?.status === "done" && fs.existsSync(this.outputFile(n.id));
      this.state.nodes[n.id] = keep ? prev : { status: "idle", usage: emptyUsage(), costUsd: 0 };
      if (keep) this.outputs.set(n.id, JSON.parse(fs.readFileSync(this.outputFile(n.id), "utf8")));
    }
    this.ctx = { cfg: this.cfg, runId, issueDate, windowStart, windowEnd, today: iso(new Date()), memory: loadMemory() };
    this.semaphore = new Semaphore(opts.concurrency ?? this.cfg.max_concurrency ?? 3);
    fs.mkdirSync(path.join(runDir(runId), "nodes"), { recursive: true });
    this.sink = (e) => {
      fs.appendFileSync(path.join(runDir(runId), "events.jsonl"), JSON.stringify(e) + "\n");
      opts.sink?.(e);
    };
    this.save();
  }

  get runId() {
    return this.state.runId;
  }

  cancel() {
    this.abort.abort();
    this.approval?.resolve();
  }

  approve() {
    this.approval?.resolve();
  }

  async run(): Promise<RunState> {
    const s = this.state;
    this.emit({ type: "run:started", runId: s.runId, at: now(), weekEnding: s.issueDate, mock: s.mock, desks: s.deskIds });
    try {
      await this.executeGraph();
      s.status = "done";
      s.endedAt = now();
      this.save();
      this.emit({ type: "run:finished", runId: s.runId, at: now(), status: "done" });
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      s.status = this.abort.signal.aborted ? "cancelled" : "failed";
      s.error = msg;
      s.endedAt = now();
      this.save();
      this.emit({ type: "run:finished", runId: s.runId, at: now(), status: s.status === "cancelled" ? "cancelled" : "failed", error: msg });
    }
    return s;
  }

  /* ---------------- execution ---------------- */

  private async executeGraph() {
    const order = topoOrder(this.graph);
    const byId = new Map(this.graph.nodes.map((n) => [n.id, n]));
    const running = new Map<string, Promise<void>>();
    const finished = new Set<string>(order.filter((id) => this.state.nodes[id].status === "done"));
    let failure: Error | null = null;

    while (finished.size < order.length) {
      if (this.abort.signal.aborted) throw new Error("cancelled");
      if (failure) throw failure;
      const ready = order.filter((id) => !finished.has(id) && !running.has(id) && byId.get(id)!.deps.every((d) => finished.has(d)));
      for (const id of ready) {
        const p = this.executeNode(byId.get(id)!)
          .then(() => {
            finished.add(id);
          })
          .catch((e) => {
            failure = e as Error;
          })
          .finally(() => running.delete(id));
        running.set(id, p);
      }
      if (running.size === 0) {
        if (failure) throw failure;
        throw new Error("Pipeline stalled: no runnable nodes");
      }
      await Promise.race(running.values());
    }
    if (failure) throw failure;
  }

  private async executeNode(node: GraphNode) {
    if (this.state.nodes[node.id].status === "done") return;
    const isAgent = ["collector", "verifier", "graphics", "editor", "columnist"].includes(node.kind);
    if (isAgent) {
      this.setStatus(node.id, "queued");
      await this.semaphore.acquire();
    }
    try {
      this.setStatus(node.id, "running");
      const output = await this.dispatch(node);
      this.outputs.set(node.id, output);
      fs.writeFileSync(this.outputFile(node.id), JSON.stringify(output, null, 2));
      const summary = summarize(node, output);
      this.state.nodes[node.id].summary = summary;
      this.emit({ type: "node:output", runId: this.runId, at: now(), nodeId: node.id, summary });
      this.setStatus(node.id, "done");
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      this.log(node.id, "error", msg);
      this.setStatus(node.id, "failed", msg);
      throw new Error(`${node.id}: ${msg}`);
    } finally {
      if (isAgent) this.semaphore.release();
    }
  }

  private async dispatch(node: GraphNode): Promise<unknown> {
    const desk = node.deskId ? this.cfg.desks.find((d) => d.id === node.deskId)! : undefined;
    switch (node.kind) {
      case "trigger":
        this.log(node.id, "info", `Run ${this.runId} started (${this.state.mock ? "mock" : this.opts.provider.name} provider)`);
        return { startedAt: this.state.startedAt, mock: this.state.mock };
      case "plan": {
        const memo = this.ctx.memory;
        this.log(node.id, "info", `Issue ${this.state.issueDate}; coverage ${this.state.windowStart} to ${this.state.windowEnd}`);
        this.log(node.id, "info", `${this.state.deskIds.length} desks · concepts covered so far: ${memo.covered_concepts.length} · glossary terms: ${memo.glossary_terms.length}`);
        return { issueDate: this.state.issueDate, windowStart: this.state.windowStart, windowEnd: this.state.windowEnd, desks: this.state.deskIds };
      }
      case "collector": {
        const { req, schema } = collectorRequest(this.ctx, desk!);
        const r = await this.callAgent(node, req, schema);
        return r;
      }
      case "verifier": {
        const collected = this.outputs.get(`collector:${desk!.id}`);
        const { req, schema } = verifierRequest(this.ctx, desk!, collected);
        return this.callAgent(node, req, schema);
      }
      case "graphics": {
        const verified = this.outputs.get(`verifier:${desk!.id}`);
        const { req, schema } = graphicsRequest(this.ctx, desk!, verified);
        return this.callAgent(node, req, schema);
      }
      case "editor": {
        const { req, schema } = editorRequest(this.ctx, this.deskResultsForEditor());
        return this.callAgent(node, req, schema);
      }
      case "columnist": {
        const editor = this.outputs.get("editor") as EditorOutput;
        const desks = this.deskResults();
        const material = {
          editor_decisions: editor,
          research_desk: desks.verifier["research"] ?? null,
          all_stories: Object.values(desks.verifier).flatMap((v) => ("stories" in v ? v.stories : [])).map((s) => ({
            id: s.id, section: s.section, headline: s.headline, deck: s.deck, why_it_matters: s.why_it_matters, evidence_type: s.evidence_type, region: s.geographic_region, sources: s.sources,
          })),
        };
        const { req, schema } = columnistRequest(this.ctx, material);
        return this.callAgent(node, req, schema);
      }
      case "render": {
        const issue = assembleIssue({
          cfg: this.cfg, runId: this.runId, issueDate: this.state.issueDate, issueNumber: listIssues().filter((i) => i.id !== this.state.issueDate).length + 1,
          windowStart: this.state.windowStart, windowEnd: this.state.windowEnd, desks: this.deskResults(),
          editor: this.outputs.get("editor") as EditorOutput, columnist: this.outputs.get("columnist") as ColumnistOutput, sample: this.state.mock,
        });
        const parsed = Issue.safeParse(issue);
        if (!parsed.success) throw new Error("Assembled issue failed validation: " + parsed.error.issues.slice(0, 5).map((i) => i.path.join(".") + " " + i.message).join("; "));
        const html = renderIssueHtml(issue, { sitePath: this.cfg.site_base_path });
        fs.writeFileSync(path.join(runDir(this.runId), "issue.json"), JSON.stringify(issue, null, 2));
        fs.writeFileSync(path.join(runDir(this.runId), "preview.html"), html);
        this.log(node.id, "info", `Rendered ${issue.front_page.length} front-page stories, ${issue.sections.reduce((n, s) => n + s.stories.length, 0)} section stories, ${issue.opportunities.length} opportunities`);
        this.log(node.id, "info", `Preview: /api/runs/${this.runId}/preview`);
        return { issueId: issue.id, bytes: html.length };
      }
      case "publish": {
        if (!this.state.autoPublish) {
          this.setStatus(node.id, "awaiting_approval");
          this.state.status = "awaiting_approval";
          this.save();
          this.log(node.id, "info", "Waiting for a club leader to approve the preview");
          let resolve!: () => void;
          const promise = new Promise<void>((r) => (resolve = r));
          this.approval = { promise, resolve };
          await promise;
          this.approval = null;
          if (this.abort.signal.aborted) throw new Error("cancelled");
          this.state.status = "running";
          this.setStatus(node.id, "running");
        }
        const issue = JSON.parse(fs.readFileSync(path.join(runDir(this.runId), "issue.json"), "utf8")) as Issue;
        const html = fs.readFileSync(path.join(runDir(this.runId), "preview.html"), "utf8");
        fs.writeFileSync(path.join(ISSUES_DIR, `${issue.id}.json`), JSON.stringify(issue, null, 2));
        const dir = path.join(SITE_DIR, "issues", issue.id);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "index.html"), html);
        fs.writeFileSync(path.join(dir, "issue.json"), JSON.stringify(issue, null, 2));
        fs.writeFileSync(path.join(SITE_DIR, "index.html"), renderArchiveHtml(listIssues(), { sitePath: this.cfg.site_base_path, cfg: this.cfg }));
        this.updateMemory(issue);
        const url = `/site/issues/${issue.id}/`;
        this.state.issueId = issue.id;
        this.state.issueUrl = url;
        this.emit({ type: "run:issue", runId: this.runId, at: now(), issueId: issue.id, url });
        this.log(node.id, "info", `Published to docs/issues/${issue.id}/index.html`);
        return { issueId: issue.id, url };
      }
    }
  }

  private async callAgent<T>(node: GraphNode, req: Parameters<Provider["run"]>[0], schema: Parameters<Provider["run"]>[1]): Promise<T> {
    const t0 = Date.now();
    this.state.nodes[node.id].model = req.model;
    this.log(node.id, "info", `${req.model} · effort ${req.effort} · tools ${req.maxToolUses > 0 ? "web search + fetch" : "none"}`);
    const r = await this.opts.provider.run(req, schema, {
      signal: this.abort.signal,
      log: (kind: LogKind, text: string) => this.log(node.id, kind, text),
      usage: (usage: Usage, model: string) => {
        const ns = this.state.nodes[node.id];
        ns.usage = addUsage(ns.usage, usage);
        ns.costUsd = estimateCostUsd(model, ns.usage);
        this.state.totalUsage = addUsage(this.state.totalUsage, usage);
        this.state.totalCostUsd = Object.values(this.state.nodes).reduce((n, x) => n + x.costUsd, 0);
        this.save();
        this.emit({ type: "node:usage", runId: this.runId, at: now(), nodeId: node.id, usage: ns.usage, model });
      },
    });
    this.log(node.id, "info", `finished in ${Math.round((Date.now() - t0) / 1000)}s`);
    return r.output as T;
  }

  private deskResults(): DeskResults {
    const res: DeskResults = { verifier: {}, graphics: {} };
    for (const d of this.cfg.desks) {
      const v = this.outputs.get(`verifier:${d.id}`);
      if (v) res.verifier[d.id] = v as VerifierOutput | OpportunityDeskOutput;
      const g = this.outputs.get(`graphics:${d.id}`);
      if (g) res.graphics[d.id] = g as GraphicsOutput;
    }
    return res;
  }

  private deskResultsForEditor() {
    const r = this.deskResults();
    return {
      desks: Object.entries(r.verifier).map(([deskId, v]) => ({
        desk: deskId,
        stories: "stories" in v ? v.stories.map((s) => ({ ...s, visual: undefined })) : [],
        opportunities_count: "opportunities" in v ? v.opportunities.length : 0,
        flags_for_editor: v.flags_for_editor,
        proposed_visuals: r.graphics[deskId]?.visuals.map((x) => ({ story_id: x.story_id, type: x.visual.visual_type, headline: x.visual.headline })) ?? [],
      })),
    };
  }

  private updateMemory(issue: Issue) {
    const mem = loadMemory();
    mem.covered_concepts = mem.covered_concepts.filter((c) => c.issue !== issue.id);
    mem.glossary_terms = mem.glossary_terms.filter((t) => t.issue !== issue.id);
    mem.covered_concepts.push({ concept: issue.cognitive_science_corner.concept, issue: issue.id });
    for (const g of issue.glossary) mem.glossary_terms.push({ term: g.term, issue: issue.id });
    saveMemory(mem);
  }

  /* ---------------- bookkeeping ---------------- */

  private outputFile(nodeId: string) {
    return path.join(runDir(this.runId), "nodes", nodeId.replace(":", "__") + ".json");
  }

  private setStatus(nodeId: string, status: NodeStatus, error?: string) {
    const ns = this.state.nodes[nodeId];
    ns.status = status;
    if (status === "running" && !ns.startedAt) ns.startedAt = now();
    if (status === "done" || status === "failed") ns.endedAt = now();
    if (error) ns.error = error;
    this.save();
    this.emit({ type: "node:status", runId: this.runId, at: now(), nodeId, status, error });
  }

  private log(nodeId: string, kind: LogKind, text: string) {
    this.emit({ type: "node:log", runId: this.runId, at: now(), nodeId, kind, text });
  }

  private emit(e: RunEvent) {
    this.sink(e);
  }

  private save() {
    fs.writeFileSync(path.join(runDir(this.runId), "run.json"), JSON.stringify(this.state, null, 2));
  }
}

function summarize(node: GraphNode, output: unknown): string {
  const o = output as Record<string, unknown>;
  switch (node.kind) {
    case "collector":
      return `${(o.items as unknown[])?.length ?? 0} candidates`;
    case "verifier": {
      const log = (o.verification_log as { status: string }[]) ?? [];
      const c = (s: string) => log.filter((x) => x.status === s).length;
      const n = (o.stories as unknown[])?.length ?? (o.opportunities as unknown[])?.length ?? 0;
      return `${n} kept · ${c("approved")} approved, ${c("revised")} revised, ${c("dropped")} dropped`;
    }
    case "graphics":
      return `${(o.visuals as unknown[])?.length ?? 0} visuals, ${(o.declined as unknown[])?.length ?? 0} declined`;
    case "editor": {
      const qa = (o.qa_report as { passed: boolean }[]) ?? [];
      return `${(o.front_page_story_ids as unknown[])?.length ?? 0} front-page · ${(o.executive_brief as unknown[])?.length ?? 0} brief rows · QA ${qa.filter((q) => q.passed).length}/${qa.length}`;
    }
    case "columnist":
      return `editorial · ${(o.glossary as unknown[])?.length ?? 0} glossary terms · concept: ${(o.cognitive_science_corner as { concept?: string })?.concept ?? ""}`;
    case "render":
      return `issue ${o.issueId} rendered`;
    case "publish":
      return `published ${o.issueId}`;
    default:
      return "ok";
  }
}

const now = () => new Date().toISOString();

class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private max: number) {}
  acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((r) => this.queue.push(r));
  }
  release() {
    const next = this.queue.shift();
    if (next) next();
    else this.active--;
  }
}
