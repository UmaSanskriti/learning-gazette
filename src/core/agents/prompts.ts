import { z } from "zod";
import { fill, loadDeskBrief, loadPrompt, type DeskConfig, type EditorialMemory, type PublicationConfig, type Role } from "../config.ts";
import type { AgentRequest } from "../llm/provider.ts";
import {
  CollectorOutput, ColumnistOutput, EditorOutput, GraphicsOutput, OpportunityDeskOutput, VerifierOutput,
} from "../schema.ts";

export interface RunContext {
  cfg: PublicationConfig;
  runId: string;
  issueDate: string;
  windowStart: string;
  windowEnd: string;
  today: string;
  memory: EditorialMemory;
}

export function buildSystem(ctx: RunContext): string {
  const c = ctx.cfg;
  return fill(loadPrompt("house-style"), {
    name: c.name,
    tagline: c.tagline,
    publisher: c.publisher,
    audience: c.audience,
    reading_time_minutes: String(c.reading_time_minutes),
    issue_date: ctx.issueDate,
    window_start: ctx.windowStart,
    window_end: ctx.windowEnd,
    today: ctx.today,
  });
}

function schemaText(schema: z.ZodType): string {
  return JSON.stringify(z.toJSONSchema(schema), null, 1);
}

function base(ctx: RunContext, role: Role, nodeId: string, deskId?: string): Omit<AgentRequest, "prompt"> {
  return {
    nodeId,
    role,
    deskId,
    model: ctx.cfg.models[role],
    effort: ctx.cfg.effort[role],
    system: buildSystem(ctx),
    maxToolUses: ctx.cfg.max_tool_uses[role],
  };
}

export function collectorRequest(ctx: RunContext, desk: DeskConfig) {
  const schema = CollectorOutput;
  const prompt = fill(loadPrompt("collector"), {
    desk_name: desk.name,
    desk_brief: loadDeskBrief(desk.id),
    schema: schemaText(schema),
  });
  return { req: { ...base(ctx, "collector", `collector:${desk.id}`, desk.id), prompt }, schema };
}

export function verifierRequest(ctx: RunContext, desk: DeskConfig, collectorOutput: unknown) {
  const schema = desk.kind === "opportunities" ? OpportunityDeskOutput : VerifierOutput;
  const extra =
    desk.kind === "opportunities"
      ? "\n\nFOR THIS DESK: output opportunities rather than stories. Open each official page and confirm the deadline or event date; drop anything closed or unverifiable.\n"
      : "";
  const prompt = fill(loadPrompt("verifier"), {
    desk_name: desk.name,
    desk_brief: loadDeskBrief(desk.id) + extra,
    input: JSON.stringify(collectorOutput, null, 1),
    schema: schemaText(schema),
  });
  return { req: { ...base(ctx, "verifier", `verifier:${desk.id}`, desk.id), prompt }, schema };
}

export function graphicsRequest(ctx: RunContext, desk: DeskConfig, verifierOutput: unknown) {
  const schema = GraphicsOutput;
  const prompt = fill(loadPrompt("graphics"), {
    desk_name: desk.name,
    input: JSON.stringify(verifierOutput, null, 1),
    schema: schemaText(schema),
  });
  return { req: { ...base(ctx, "graphics", `graphics:${desk.id}`, desk.id), prompt }, schema };
}

export function editorRequest(ctx: RunContext, deskOutputs: unknown) {
  const schema = EditorOutput;
  const prompt = fill(loadPrompt("editor"), {
    tracked_organizations: ctx.cfg.tracked_organizations.join(", "),
    input: JSON.stringify(deskOutputs, null, 1),
    schema: schemaText(schema),
  });
  return { req: { ...base(ctx, "editor", "editor"), prompt }, schema };
}

export function columnistRequest(ctx: RunContext, material: unknown) {
  const schema = ColumnistOutput;
  const recent = (xs: { issue: string }[], key: "concept" | "term") =>
    xs
      .slice(-8)
      .map((x) => (x as Record<string, string>)[key])
      .join(", ") || "none yet";
  const prompt = fill(loadPrompt("columnist"), {
    covered_concepts: recent(ctx.memory.covered_concepts, "concept"),
    recent_glossary: ctx.memory.glossary_terms
      .slice(-40)
      .map((t) => t.term)
      .join(", ") || "none yet",
    input: JSON.stringify(material, null, 1),
    schema: schemaText(schema),
  });
  return { req: { ...base(ctx, "columnist", "columnist"), prompt }, schema };
}
