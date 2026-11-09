import type { z } from "zod";
import type { Effort, Role } from "../config.ts";
import type { LogKind, Usage } from "../events.ts";

export interface AgentRequest {
  nodeId: string;
  role: Role;
  deskId?: string;
  model: string;
  effort: Effort;
  /** Stable, cacheable house-style block. */
  system: string;
  /** Role prompt with inputs and schema filled in. */
  prompt: string;
  /** Number of web search / fetch uses allowed. 0 disables tools. */
  maxToolUses: number;
  maxTokens?: number;
}

export interface AgentCallbacks {
  log: (kind: LogKind, text: string) => void;
  usage: (usage: Usage, model: string) => void;
  signal?: AbortSignal;
}

export interface AgentResult<T> {
  output: T;
  rawText: string;
}

export interface Provider {
  readonly name: string;
  run<T>(req: AgentRequest, schema: z.ZodType<T>, cb: AgentCallbacks): Promise<AgentResult<T>>;
}

/** Pull the JSON object out of a model answer: last fenced block first, then outermost braces. */
export function extractJson(text: string): unknown {
  const fences = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  const candidates: string[] = [];
  if (fences.length) candidates.push(fences[fences.length - 1][1]);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  let lastErr: unknown;
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`No parseable JSON in model answer: ${(lastErr as Error)?.message ?? "empty"}`);
}
