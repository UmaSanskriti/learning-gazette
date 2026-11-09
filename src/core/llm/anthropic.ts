import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { extractJson, type AgentCallbacks, type AgentRequest, type AgentResult, type Provider } from "./provider.ts";
import type { Usage } from "../events.ts";

/**
 * Real provider: one agentic turn loop per agent using server-side web search
 * and web fetch, streamed so the dashboard can show searches and drafting live.
 *
 * Model behaviour notes (see the claude-api skill): thinking is adaptive on
 * Claude Opus 5, effort is set per role, and server-side refusal fallbacks are
 * enabled by default so a false-positive safety decline does not kill a run.
 */
export class AnthropicProvider implements Provider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ timeout: 20 * 60 * 1000 });
  }

  async run<T>(req: AgentRequest, schema: z.ZodType<T>, cb: AgentCallbacks): Promise<AgentResult<T>> {
    const tools =
      req.maxToolUses > 0
        ? [
            { type: "web_search_20260209" as const, name: "web_search" as const, max_uses: req.maxToolUses },
            { type: "web_fetch_20260209" as const, name: "web_fetch" as const, max_uses: Math.max(3, Math.ceil(req.maxToolUses / 2)) },
          ]
        : undefined;

    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: req.prompt }];
    let finalText = "";

    for (let turn = 0; turn < 16; turn++) {
      if (cb.signal?.aborted) throw new Error("cancelled");
      const stream = this.client.beta.messages.stream(
        {
          model: req.model,
          max_tokens: req.maxTokens ?? 64000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive", display: "summarized" },
          output_config: { effort: req.effort },
          system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral", ttl: "1h" } }],
          tools,
          messages,
        },
        { signal: cb.signal },
      );

      const text = new Throttle((t) => cb.log("text", t));
      const thinking = new Throttle((t) => cb.log("thinking", t));
      const toolInputs = new Map<number, { name: string; json: string }>();

      for await (const event of stream) {
        switch (event.type) {
          case "content_block_start": {
            const b = event.content_block;
            if (b.type === "server_tool_use") toolInputs.set(event.index, { name: b.name, json: "" });
            else if (b.type === "web_search_tool_result") {
              const n = Array.isArray(b.content) ? b.content.length : 0;
              cb.log("result", Array.isArray(b.content) ? `${n} search results` : `search error: ${b.content.error_code}`);
            } else if (b.type === "web_fetch_tool_result") {
              cb.log("result", b.content.type === "web_fetch_result" ? `fetched ${b.content.url}` : `fetch error: ${b.content.error_code}`);
            }
            break;
          }
          case "content_block_delta": {
            const d = event.delta;
            if (d.type === "text_delta") text.push(d.text);
            else if (d.type === "thinking_delta") thinking.push(d.thinking);
            else if (d.type === "input_json_delta") {
              const t = toolInputs.get(event.index);
              if (t) t.json += d.partial_json;
            }
            break;
          }
          case "content_block_stop": {
            const t = toolInputs.get(event.index);
            if (t) {
              toolInputs.delete(event.index);
              try {
                const input = JSON.parse(t.json || "{}") as Record<string, unknown>;
                if (t.name === "web_search") cb.log("search", String(input.query ?? ""));
                else if (t.name === "web_fetch") cb.log("fetch", String(input.url ?? ""));
                else cb.log("info", `${t.name}: ${t.json.slice(0, 200)}`);
              } catch {
                cb.log("info", `${t.name} call`);
              }
            }
            break;
          }
        }
      }
      text.flush();
      thinking.flush();

      const message = await stream.finalMessage();
      cb.usage(pickUsage(message.usage), message.model);

      if (message.stop_reason === "refusal") {
        const why = message.stop_details?.type === "refusal" ? message.stop_details.category ?? "unspecified" : "unspecified";
        throw new Error(`Model declined the request (category: ${why}) and no fallback succeeded`);
      }
      if (message.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: message.content });
        cb.log("info", "server tool loop paused, resuming");
        continue;
      }
      if (message.stop_reason === "max_tokens") {
        throw new Error("Output truncated at max_tokens; raise maxTokens for this role");
      }
      finalText = message.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      break;
    }

    return this.parseOrRepair(req, schema, finalText, cb);
  }

  private async parseOrRepair<T>(req: AgentRequest, schema: z.ZodType<T>, rawText: string, cb: AgentCallbacks): Promise<AgentResult<T>> {
    let problem = "";
    try {
      const parsed = schema.safeParse(extractJson(rawText));
      if (parsed.success) return { output: parsed.data, rawText };
      problem = parsed.error.issues.slice(0, 12).map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    } catch (e) {
      problem = (e as Error).message;
    }
    cb.log("warn", `answer did not match schema, running repair pass\n${problem}`);

    const stream = this.client.beta.messages.stream(
      {
        model: req.model,
        max_tokens: req.maxTokens ?? 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral", ttl: "1h" } }],
        messages: [
          {
            role: "user",
            content:
              "Convert the draft below into a JSON object that matches the required schema exactly. Preserve the content; fix structure only. Do not add facts.\n\nVALIDATION PROBLEMS\n" +
              problem +
              "\n\nDRAFT\n" +
              rawText,
          },
        ],
      },
      { signal: cb.signal },
    );
    const message = await stream.finalMessage();
    cb.usage(pickUsage(message.usage), message.model);
    if (message.stop_reason === "refusal") throw new Error("Repair pass was declined");
    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      throw new Error("Repair pass still failed validation: " + parsed.error.issues.slice(0, 5).map((i) => i.path.join(".") + " " + i.message).join("; "));
    }
    return { output: parsed.data, rawText: text };
  }
}

function pickUsage(u: Anthropic.Beta.BetaUsage): Usage {
  return {
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
  };
}

/** Batches streamed deltas so the dashboard gets a few updates a second, not one per token. */
class Throttle {
  private buf = "";
  private timer: NodeJS.Timeout | null = null;
  constructor(private emit: (t: string) => void, private ms = 350) {}
  push(t: string) {
    this.buf += t;
    if (this.buf.length > 600) this.flush();
    else if (!this.timer) this.timer = setTimeout(() => this.flush(), this.ms);
  }
  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.buf) {
      this.emit(this.buf);
      this.buf = "";
    }
  }
}
