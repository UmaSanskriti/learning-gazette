import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { extractJson, type AgentCallbacks, type AgentRequest, type AgentResult, type Provider } from "./provider.ts";
import type { Usage } from "../events.ts";
import { RUNS_DIR } from "../config.ts";

/**
 * Provider that runs each agent as a headless Claude Code session
 * (`claude -p`). Claude Code authenticates with the leader's own claude.ai
 * login, so runs are covered by a Claude subscription rather than API credits.
 *
 * Each agent gets a fresh, restricted session: only the built-in WebSearch and
 * WebFetch tools, no filesystem or shell access, no project settings, and a
 * scratch working directory. Structured output comes back through
 * `--json-schema`, and the stream-json event feed drives the dashboard log.
 */
export class ClaudeCodeProvider implements Provider {
  readonly name = "claude-code";
  private bin: string;

  constructor(bin = process.env.CLAUDE_BIN ?? "claude") {
    this.bin = bin;
  }

  /** True when the claude CLI is installed and logged in. */
  static available(): { ok: boolean; detail: string } {
    const bin = process.env.CLAUDE_BIN ?? "claude";
    const r = spawnSync(bin, ["auth", "status"], { encoding: "utf8", timeout: 40000 });
    if (r.error || r.status !== 0) return { ok: false, detail: "claude CLI not found or not logged in (run `claude` once and log in)" };
    try {
      const j = JSON.parse(r.stdout) as { loggedIn?: boolean; authMethod?: string; email?: string };
      if (!j.loggedIn) return { ok: false, detail: "claude CLI is installed but not logged in" };
      return { ok: true, detail: `${j.authMethod ?? "login"}${j.email ? " · " + j.email : ""}` };
    } catch {
      return { ok: false, detail: "could not read claude auth status" };
    }
  }

  async run<T>(req: AgentRequest, schema: z.ZodType<T>, cb: AgentCallbacks): Promise<AgentResult<T>> {
    const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
    delete jsonSchema.$schema; // Claude Code's validator rejects the 2020-12 $schema URI zod emits
    const withTools = req.maxToolUses > 0;
    const maxTurns = withTools ? Math.max(20, req.maxToolUses * 3 + 10) : 6;
    const cwd = path.join(RUNS_DIR, "_agent-cwd");
    fs.mkdirSync(cwd, { recursive: true });

    const system =
      "In this session you are working as an editorial agent for a newsletter: the task is web research and writing, not software. " +
      (withTools ? `Use WebSearch and WebFetch as your research tools, with a budget of about ${req.maxToolUses} searches and fetches in total. ` : "") +
      "When you are finished, provide the final answer as the structured output.\n\n" +
      req.system;

    const args = [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--no-session-persistence",
      "--restricted",
      "--model", req.model,
      "--effort", req.effort,
      "--max-turns", String(maxTurns),
      "--tools", withTools ? "WebSearch,WebFetch" : "",
      "--append-system-prompt", system,
      "--json-schema", JSON.stringify(jsonSchema),
    ];
    if (withTools) args.push("--allowedTools", "WebSearch", "WebFetch");

    const first = await this.invoke(args, req.prompt, cwd, cb);
    const parsed = this.tryParse(schema, first);
    if (parsed) return parsed;

    cb.log("warn", "answer did not match schema, running repair pass");
    const repairArgs = args.map((a, i) => (args[i - 1] === "--tools" ? "" : args[i - 1] === "--max-turns" ? "4" : a)).filter((a, i) => !(args[i - 1] === "--allowedTools" || a === "--allowedTools" || args[i - 2] === "--allowedTools"));
    const repairPrompt =
      "Convert the draft below into an answer that matches the required structured output exactly. Preserve the content; fix structure only. Do not add facts.\n\nDRAFT\n" + first.text;
    const second = await this.invoke(repairArgs, repairPrompt, cwd, cb);
    const fixed = this.tryParse(schema, second);
    if (!fixed) throw new Error("Repair pass still failed validation");
    return fixed;
  }

  private tryParse<T>(schema: z.ZodType<T>, r: { structured: unknown; text: string }): AgentResult<T> | null {
    const candidates: unknown[] = [];
    if (r.structured !== undefined) candidates.push(r.structured);
    try {
      candidates.push(extractJson(r.text));
    } catch {
      /* no JSON in text */
    }
    for (const c of candidates) {
      const p = schema.safeParse(c);
      if (p.success) return { output: p.data, rawText: r.text };
    }
    return null;
  }

  private invoke(args: string[], prompt: string, cwd: string, cb: AgentCallbacks): Promise<{ structured: unknown; text: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, CLAUDECODE: "" } });
      let buf = "";
      let stderr = "";
      let text = "";
      let structured: unknown;
      let finished = false;
      const onAbort = () => child.kill("SIGTERM");
      cb.signal?.addEventListener("abort", onAbort, { once: true });

      child.stdout.on("data", (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let e: StreamEvent;
          try {
            e = JSON.parse(line) as StreamEvent;
          } catch {
            continue;
          }
          const out = handleEvent(e, cb);
          if (out) {
            finished = true;
            text = out.text;
            structured = out.structured;
          }
        }
      });
      child.stderr.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
      child.on("error", (err) => reject(new Error(`could not start claude CLI: ${err.message}`)));
      child.on("close", (code) => {
        cb.signal?.removeEventListener("abort", onAbort);
        if (cb.signal?.aborted) return reject(new Error("cancelled"));
        if (!finished) return reject(new Error(`claude exited (${code}) without a result${stderr ? ": " + stderr.trim().slice(-400) : ""}`));
        resolve({ structured, text });
      });
      child.stdin.end(prompt);
    });
  }
}

interface StreamEvent {
  type: string;
  subtype?: string;
  model?: string;
  message?: { content?: Array<{ type: string; name?: string; input?: Record<string, unknown>; text?: string; thinking?: string; content?: unknown }> | string };
  rate_limit_info?: Record<string, unknown>;
  result?: string;
  structured_output?: unknown;
  is_error?: boolean;
  usage?: Record<string, number>;
  num_turns?: number;
  errors?: string[];
}

function handleEvent(e: StreamEvent, cb: AgentCallbacks): { text: string; structured: unknown } | null {
  switch (e.type) {
    case "system":
      if (e.subtype === "init") cb.log("info", `claude code session · ${e.model ?? ""}`);
      return null;
    case "assistant": {
      const blocks = Array.isArray(e.message?.content) ? e.message!.content : [];
      for (const b of blocks) {
        if (b.type === "tool_use") {
          const input = b.input ?? {};
          if (b.name === "WebSearch") cb.log("search", String(input.query ?? ""));
          else if (b.name === "WebFetch") cb.log("fetch", String(input.url ?? ""));
          else if (b.name === "StructuredOutput") cb.log("info", "submitting structured output");
          else cb.log("info", `${b.name ?? "tool"} call`);
        } else if (b.type === "text" && b.text?.trim()) cb.log("text", b.text.trim());
        else if (b.type === "thinking" && b.thinking?.trim()) cb.log("thinking", b.thinking.trim().slice(0, 600));
      }
      return null;
    }
    case "user": {
      const blocks = Array.isArray(e.message?.content) ? e.message!.content : [];
      for (const b of blocks) {
        if (b.type === "tool_result") {
          const c = typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "");
          const n = (c.match(/\nLink/g) ?? []).length;
          cb.log("result", n ? `${n} search results` : `tool result (${c.length} chars)`);
        }
      }
      return null;
    }
    case "rate_limit_event":
      cb.log("warn", `rate limit notice: ${JSON.stringify(e.rate_limit_info ?? {}).slice(0, 300)}`);
      return null;
    case "result": {
      if (e.usage) cb.usage(pickUsage(e.usage), e.model ?? "claude-code");
      if (e.is_error) throw new Error(`claude code error (${e.subtype ?? "unknown"}): ${(e.errors ?? [e.result ?? ""]).join("; ").slice(0, 400)}`);
      if (e.subtype && e.subtype !== "success") cb.log("warn", `session ended with ${e.subtype}`);
      return { text: e.result ?? "", structured: e.structured_output };
    }
    default:
      return null;
  }
}

function pickUsage(u: Record<string, number>): Usage {
  return {
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
  };
}
