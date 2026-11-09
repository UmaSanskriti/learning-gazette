import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { ISSUES_DIR, SITE_DIR, ensureDirs, loadConfig } from "./config.ts";
import { makeProvider, providerAvailability, type ProviderName } from "./llm/select.ts";
import { Runner, listIssues, loadRunState } from "./runner.ts";
import { renderArchiveHtml, renderIssueHtml } from "./render/index.ts";
import { Issue } from "./schema.ts";
import type { RunEvent } from "./events.ts";

/**
 * CLI entry points:
 *   npm run generate -- [--provider claude-code|api|mock] [--issue-date YYYY-MM-DD] [--desks a,b] [--mock] [--auto-publish] [--resume RUN_ID] [--concurrency N]
 *   npm run demo                      (mock provider, auto-publish)
 *   npm run render -- <issue-id>       (re-render docs/ from data/issues/<id>.json)
 *   npm run validate-issue -- <file>   (validate an issue JSON against the schema)
 */

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name: string) => args.includes(`--${name}`);

function printEvent(e: RunEvent) {
  const t = e.at.slice(11, 19);
  switch (e.type) {
    case "run:started": console.log(`[${t}] run ${e.runId} started · issue ${e.weekEnding} · ${e.desks.length} desks · ${e.mock ? "MOCK" : "live"}`); break;
    case "node:status": if (["running", "done", "failed", "awaiting_approval"].includes(e.status)) console.log(`[${t}] ${e.nodeId.padEnd(24)} ${e.status}${e.error ? " · " + e.error : ""}`); break;
    case "node:log": if (["search", "fetch", "warn", "error", "info"].includes(e.kind)) console.log(`[${t}]   ${e.nodeId.padEnd(22)} ${e.kind}: ${e.text.split("\n")[0].slice(0, 140)}`); break;
    case "node:output": console.log(`[${t}]   ${e.nodeId.padEnd(22)} → ${e.summary}`); break;
    case "run:issue": console.log(`[${t}] issue ${e.issueId} published → docs/issues/${e.issueId}/index.html`); break;
    case "run:finished": console.log(`[${t}] run ${e.status}${e.error ? ": " + e.error : ""}`); break;
  }
}

async function main() {
  ensureDirs();
  switch (cmd) {
    case "generate": {
      const resume = flag("resume");
      const avail = providerAvailability();
      const providerName: ProviderName = has("mock") ? "mock" : ((flag("provider") as ProviderName | undefined) ?? (resume ? (loadRunState(resume)?.provider as ProviderName | undefined) : undefined) ?? avail.default);
      if (providerName === "api" && !avail.api) throw new Error("No ANTHROPIC_API_KEY set; use --provider claude-code (subscription login) or --mock");
      if (providerName === "claude-code" && !avail.claudeCode) throw new Error(`Claude Code is not available: ${avail.claudeCodeDetail}`);
      const mock = providerName === "mock";
      console.log(`Provider: ${providerName}${providerName === "claude-code" ? " (" + avail.claudeCodeDetail + ")" : ""}`);
      const runner = new Runner({
        runId: resume,
        resume: !!resume,
        issueDate: flag("issue-date") ?? (resume ? loadRunState(resume)?.issueDate : undefined),
        deskIds: flag("desks")?.split(",").map((s) => s.trim()).filter(Boolean),
        mock,
        autoPublish: has("auto-publish") || process.env.AUTO_PUBLISH === "true" || !process.stdin.isTTY,
        concurrency: flag("concurrency") ? Number(flag("concurrency")) : undefined,
        provider: makeProvider(providerName),
        sink: printEvent,
      });
      if (!runner.state.autoPublish) {
        console.log("Approval is required before publishing. Press Enter when the publish step is waiting, or pass --auto-publish.");
        process.stdin.on("data", () => runner.approve());
      }
      const state = await runner.run();
      process.stdin.pause();
      console.log(`Total tokens: ${state.totalUsage.input_tokens + state.totalUsage.output_tokens} · ${providerName === "api" ? "estimated cost" : "list-price equivalent"} $${state.totalCostUsd.toFixed(2)}`);
      process.exit(state.status === "done" ? 0 : 1);
    }
    case "render": {
      const id = args[1];
      if (!id) throw new Error("Usage: npm run render -- <issue-id>");
      const cfg = loadConfig();
      const issue = Issue.parse(JSON.parse(fs.readFileSync(path.join(ISSUES_DIR, `${id}.json`), "utf8")));
      const dir = path.join(SITE_DIR, "issues", id);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "index.html"), renderIssueHtml(issue, { sitePath: cfg.site_base_path }));
      fs.writeFileSync(path.join(dir, "issue.json"), JSON.stringify(issue, null, 2));
      fs.writeFileSync(path.join(SITE_DIR, "index.html"), renderArchiveHtml(listIssues(), { sitePath: cfg.site_base_path, cfg }));
      console.log(`Rendered docs/issues/${id}/index.html and docs/index.html`);
      return;
    }
    case "validate": {
      const file = args[1];
      if (!file) throw new Error("Usage: npm run validate-issue -- <file.json>");
      const r = Issue.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
      if (r.success) console.log("Valid issue");
      else {
        console.error(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
        process.exit(1);
      }
      return;
    }
    default:
      console.log("Commands: generate | render <issue-id> | validate <file>");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
