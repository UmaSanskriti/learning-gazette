import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..", "..");
export const CONFIG_DIR = path.join(ROOT, "config");
export const PROMPTS_DIR = path.join(CONFIG_DIR, "prompts");
export const DATA_DIR = path.join(ROOT, "data");
export const RUNS_DIR = path.join(DATA_DIR, "runs");
export const ISSUES_DIR = path.join(DATA_DIR, "issues");
export const MEMORY_DIR = path.join(DATA_DIR, "memory");
export const SITE_DIR = path.join(ROOT, "docs");

export type Role = "collector" | "verifier" | "graphics" | "editor" | "columnist";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface DeskConfig {
  id: string;
  name: string;
  kind: "stories" | "opportunities";
  graphics: boolean;
  sections: string[];
  summary: string;
}

export interface PublicationConfig {
  name: string;
  tagline: string;
  publisher: string;
  audience: string;
  reading_time_minutes: number;
  issue_weekday: string;
  site_base_path: string;
  max_concurrency: number;
  models: Record<Role, string>;
  effort: Record<Role, Effort>;
  max_tool_uses: Record<Role, number>;
  tracked_organizations: string[];
  desks: DeskConfig[];
}

let cached: PublicationConfig | null = null;

export function loadConfig(): PublicationConfig {
  if (cached) return cached;
  const raw = fs.readFileSync(path.join(CONFIG_DIR, "publication.json"), "utf8");
  cached = JSON.parse(raw) as PublicationConfig;
  return cached;
}

export function loadPrompt(name: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, `${name}.md`), "utf8");
}

export function loadDeskBrief(deskId: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, "desks", `${deskId}.md`), "utf8");
}

/** Replace {{key}} placeholders. Unknown keys are left in place so they are visible in logs. */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key: string) => (key in vars ? vars[key] : m));
}

export function ensureDirs(): void {
  for (const d of [DATA_DIR, RUNS_DIR, ISSUES_DIR, MEMORY_DIR, SITE_DIR, path.join(SITE_DIR, "issues")]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

/** Editorial memory that accumulates across issues (concepts covered, glossary terms defined). */
export interface EditorialMemory {
  covered_concepts: { concept: string; issue: string }[];
  glossary_terms: { term: string; issue: string }[];
}

export function loadMemory(): EditorialMemory {
  const file = path.join(MEMORY_DIR, "editorial-memory.json");
  if (!fs.existsSync(file)) return { covered_concepts: [], glossary_terms: [] };
  return JSON.parse(fs.readFileSync(file, "utf8")) as EditorialMemory;
}

export function saveMemory(mem: EditorialMemory): void {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.writeFileSync(path.join(MEMORY_DIR, "editorial-memory.json"), JSON.stringify(mem, null, 2));
}
