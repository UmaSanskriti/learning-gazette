import type { PublicationConfig } from "./config.ts";
import type {
  ColumnistOutput, EditorOutput, GraphicsOutput, Issue, OpportunityDeskOutput, Section, Story, VerifierOutput,
} from "./schema.ts";

export const SECTION_TITLES: Record<Section, string> = {
  front_page: "Front Page",
  world_education: "World Education Desk",
  company_watch: "AI & EdTech",
  startup_capital: "Startup & Capital Radar",
  policy_governance: "Policy & Governance Desk",
  research_review: "Research Desk",
  social_signal: "Social Signal",
  higher_education: "Higher Education",
  k12: "K-12 Desk",
  harvard_watch: "Harvard Watch",
  opportunity_board: "Opportunity Board",
};

const SECTION_ORDER: Section[] = [
  "world_education", "company_watch", "social_signal", "startup_capital", "policy_governance", "research_review",
  "higher_education", "k12", "harvard_watch",
];

export interface DeskResults {
  verifier: Record<string, VerifierOutput | OpportunityDeskOutput>;
  graphics: Record<string, GraphicsOutput>;
}

export interface AssembleInput {
  cfg: PublicationConfig;
  runId: string;
  issueDate: string;
  issueNumber: number;
  windowStart: string;
  windowEnd: string;
  desks: DeskResults;
  editor: EditorOutput;
  columnist: ColumnistOutput;
  sample: boolean;
}

export function assembleIssue(inp: AssembleInput): Issue {
  const stories = new Map<string, Story>();
  const opportunities: Issue["opportunities"] = [];

  for (const [deskId, out] of Object.entries(inp.desks.verifier)) {
    if ("opportunities" in out) {
      opportunities.push(...out.opportunities);
      continue;
    }
    for (const s of out.stories) {
      if (!stories.has(s.id)) stories.set(s.id, { ...s });
      else stories.set(`${deskId}:${s.id}`, { ...s, id: `${deskId}:${s.id}` });
    }
  }

  for (const g of Object.values(inp.desks.graphics)) {
    for (const v of g.visuals) {
      const s = stories.get(v.story_id);
      if (s && !s.visual) s.visual = v.visual;
    }
  }

  for (const id of inp.editor.dropped_story_ids) stories.delete(id);

  const front: Story[] = [];
  for (const id of inp.editor.front_page_story_ids) {
    const s = stories.get(id);
    if (s) {
      front.push({ ...s, section: "front_page" });
      stories.delete(id);
    }
  }
  const leadId = front.some((s) => s.id === inp.editor.lead_story_id) ? inp.editor.lead_story_id : front[0]?.id ?? "";
  if (leadId && front[0]?.id !== leadId) {
    const i = front.findIndex((s) => s.id === leadId);
    const [lead] = front.splice(i, 1);
    front.unshift(lead);
  }

  const sections: Issue["sections"] = [];
  for (const sec of SECTION_ORDER) {
    const list = [...stories.values()].filter((s) => s.section === sec);
    if (list.length) sections.push({ section: sec, title: SECTION_TITLES[sec], stories: list });
  }
  const orphaned = [...stories.values()].filter((s) => !SECTION_ORDER.includes(s.section) && s.section !== "front_page");
  if (orphaned.length) sections.push({ section: "world_education", title: "Also This Week", stories: orphaned });

  const words =
    [...front, ...sections.flatMap((s) => s.stories)].reduce((n, s) => n + s.body.split(/\s+/).length, 0) +
    inp.columnist.editorial.body.split(/\s+/).length + 1500;

  return {
    id: inp.issueDate,
    issue_number: inp.issueNumber,
    masthead: {
      name: inp.cfg.name,
      tagline: inp.cfg.tagline,
      issue_date: inp.issueDate,
      window_start: inp.windowStart,
      window_end: inp.windowEnd,
      estimated_reading_minutes: Math.max(5, Math.round(words / 230)),
    },
    front_page: front,
    lead_story_id: leadId,
    executive_brief: inp.editor.executive_brief,
    sections,
    company_watch: inp.editor.company_watch,
    market_signal_of_the_week: inp.editor.market_signal_of_the_week,
    paper_of_the_week: inp.columnist.paper_of_the_week,
    cognitive_science_corner: inp.columnist.cognitive_science_corner,
    opportunities,
    builders_corner: inp.columnist.builders_corner,
    glossary: inp.columnist.glossary,
    editorial: inp.columnist.editorial,
    qa_report: inp.editor.qa_report,
    generated_at: new Date().toISOString(),
    run_id: inp.runId,
    sample: inp.sample,
  };
}
