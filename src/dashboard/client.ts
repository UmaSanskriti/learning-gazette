import type { DeskConfig } from "../core/config.ts";
import type { Graph } from "../core/graph.ts";
import type { RunState } from "../core/runner.ts";

export interface DashboardConfig {
  publication: { name: string; tagline: string; publisher: string; issue_weekday: string };
  desks: DeskConfig[];
  models: Record<string, string>;
  effort: Record<string, string>;
  graph: Graph;
  nextIssueDate: string;
  schedule: { enabled: boolean; cron: string; tz: string };
  providers: { api: boolean; claudeCode: boolean; claudeCodeDetail: string; default: "api" | "claude-code" | "mock" };
  autoPublishDefault: boolean;
}

async function j<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? res.statusText);
  return body as T;
}

export const api = {
  config: () => fetch("/api/config").then((r) => j<DashboardConfig>(r)),
  runs: () => fetch("/api/runs").then((r) => j<RunState[]>(r)),
  run: (id: string) => fetch(`/api/runs/${id}`).then((r) => j<RunState>(r)),
  start: (body: { issueDate?: string; deskIds?: string[]; provider: "api" | "claude-code" | "mock"; mock: boolean; autoPublish: boolean }) =>
    fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => j<{ runId: string }>(r)),
  approve: (id: string) => fetch(`/api/runs/${id}/approve`, { method: "POST" }).then((r) => j<{ ok: true }>(r)),
  cancel: (id: string) => fetch(`/api/runs/${id}/cancel`, { method: "POST" }).then((r) => j<{ ok: true }>(r)),
  resume: (id: string) => fetch(`/api/runs/${id}/resume`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => j<{ runId: string }>(r)),
  nodeOutput: (id: string, nodeId: string) => fetch(`/api/runs/${id}/nodes/${encodeURIComponent(nodeId)}`).then((r) => j<unknown>(r)),
  issues: () => fetch("/api/issues").then((r) => j<{ id: string; issue_number: number; sample: boolean; lead: string; url: string }[]>(r)),
};
