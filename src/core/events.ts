/**
 * Events emitted by the runner. They are appended to data/runs/<id>/events.jsonl
 * and streamed to the dashboard over SSE, so the UI can replay a run exactly.
 */

export type NodeStatus = "idle" | "queued" | "running" | "done" | "failed" | "skipped" | "awaiting_approval";

export type LogKind = "info" | "thinking" | "text" | "search" | "fetch" | "result" | "warn" | "error";

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export type RunEvent =
  | { type: "run:started"; runId: string; at: string; weekEnding: string; mock: boolean; desks: string[] }
  | { type: "run:finished"; runId: string; at: string; status: "done" | "failed" | "cancelled"; error?: string }
  | { type: "node:status"; runId: string; at: string; nodeId: string; status: NodeStatus; error?: string }
  | { type: "node:log"; runId: string; at: string; nodeId: string; kind: LogKind; text: string }
  | { type: "node:usage"; runId: string; at: string; nodeId: string; usage: Usage; model: string }
  | { type: "node:output"; runId: string; at: string; nodeId: string; summary: string }
  | { type: "run:issue"; runId: string; at: string; issueId: string; url: string };

export type EventSink = (event: RunEvent) => void;

export function emptyUsage(): Usage {
  return { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
}

export function addUsage(a: Usage, b: Partial<Usage>): Usage {
  return {
    input_tokens: a.input_tokens + (b.input_tokens ?? 0),
    output_tokens: a.output_tokens + (b.output_tokens ?? 0),
    cache_read_input_tokens: a.cache_read_input_tokens + (b.cache_read_input_tokens ?? 0),
    cache_creation_input_tokens: a.cache_creation_input_tokens + (b.cache_creation_input_tokens ?? 0),
  };
}

/** Rough cost in USD from first-party list prices; good enough for a dashboard estimate. */
export function estimateCostUsd(model: string, u: Usage): number {
  const price = PRICES[model] ?? PRICES["claude-opus-5"];
  return (
    (u.input_tokens * price.input +
      u.output_tokens * price.output +
      u.cache_read_input_tokens * price.input * 0.1 +
      u.cache_creation_input_tokens * price.input * 1.25) /
    1_000_000
  );
}

const PRICES: Record<string, { input: number; output: number }> = {
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};
