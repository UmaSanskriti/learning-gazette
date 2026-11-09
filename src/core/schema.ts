import { z } from "zod";

/**
 * Canonical content schemas for The Learning Gazette.
 *
 * Content is separated from presentation: agents produce these JSON shapes,
 * the renderer (src/core/render) turns an Issue into HTML. Keep the schemas
 * structured-output friendly (no recursion, plain enums) because the repair
 * pass sends them to the API as a JSON schema.
 */

export const Region = z.enum([
  "global",
  "north_america",
  "latin_america_caribbean",
  "europe",
  "africa",
  "middle_east_north_africa",
  "south_asia",
  "east_southeast_asia",
  "oceania",
]);
export type Region = z.infer<typeof Region>;

export const EvidenceType = z.enum([
  "peer_reviewed",
  "preprint",
  "government_or_regulator",
  "intergovernmental_report",
  "university_or_lab",
  "company_announcement",
  "company_reported_results",
  "journalism",
  "dataset",
  "event_or_opportunity",
  "social_post",
  "editorial_analysis",
]);
export type EvidenceType = z.infer<typeof EvidenceType>;

export const Source = z.object({
  title: z.string(),
  url: z.string(),
  publisher: z.string().describe("Organisation or outlet that published the source"),
  kind: z.enum(["primary", "secondary"]),
  date: z.string().describe("Publication date, ISO 8601 (YYYY-MM-DD) when known, else empty string"),
});
export type Source = z.infer<typeof Source>;

/* ---------- Visuals ---------- */

const DataPoint = z.object({
  label: z.string(),
  value: z.number(),
  series: z.string().describe("Series name; use a single consistent name when there is only one series"),
});

const TimelineItem = z.object({
  date: z.string().describe("ISO date or short label, e.g. 2026-09-14 or 'Q3 2026'"),
  label: z.string(),
  detail: z.string(),
});

const FlowStep = z.object({
  title: z.string(),
  detail: z.string(),
});

const ComparisonRow = z.object({
  dimension: z.string(),
  values: z.array(z.string()).describe("One cell per column, in column order"),
});

export const Visual = z.object({
  visual_type: z.enum([
    "bar",
    "horizontal_bar",
    "line",
    "key_number",
    "timeline",
    "process_flow",
    "comparison_table",
    "pull_quote",
  ]),
  headline: z.string().describe("The takeaway the visual communicates, written as a sentence"),
  what_it_shows: z.string(),
  source: z.string().describe("Citation for the data, including publisher and year"),
  source_url: z.string(),
  alt_text: z.string(),
  placement: z.string().describe("Where the visual sits, e.g. 'after paragraph 2 of the lead story'"),
  unit: z.string().describe("Unit for numeric charts (%, USD millions, students). Empty when not applicable"),
  data_points: z.array(DataPoint).describe("For bar, horizontal_bar and line charts"),
  timeline: z.array(TimelineItem).describe("For timeline visuals"),
  steps: z.array(FlowStep).describe("For process_flow visuals"),
  columns: z.array(z.string()).describe("Column headers for comparison_table"),
  rows: z.array(ComparisonRow).describe("Rows for comparison_table"),
  key_number: z.string().describe("The number itself for key_number, e.g. '46%'"),
  key_number_context: z.string().describe("One line of context under a key_number"),
  quote: z.string().describe("For pull_quote"),
  attribution: z.string().describe("For pull_quote"),
});
export type Visual = z.infer<typeof Visual>;

/* ---------- Stories ---------- */

export const Section = z.enum([
  "front_page",
  "world_education",
  "company_watch",
  "startup_capital",
  "policy_governance",
  "research_review",
  "social_signal",
  "higher_education",
  "k12",
  "harvard_watch",
  "opportunity_board",
]);
export type Section = z.infer<typeof Section>;

export const Story = z.object({
  id: z.string().describe("Stable slug, lowercase with hyphens"),
  section: Section,
  headline: z.string(),
  deck: z.string().describe("One-sentence explanation under the headline"),
  body: z.string().describe("Plain prose paragraphs separated by blank lines. No markdown headings, no bullet lists unless essential"),
  why_it_matters: z.string(),
  watch_next: z.string(),
  evidence_note: z.string().describe("Sample size, design, limitations, and whether results are company-reported. Empty when not material"),
  sources: z.array(Source),
  visual: Visual.nullable(),
  tags: z.array(z.string()),
  evidence_type: EvidenceType,
  geographic_region: Region,
  event_date: z.string().describe("Date of the underlying development, ISO 8601, when known"),
  is_background: z.boolean().describe("True when the item is older context rather than this week's news"),
});
export type Story = z.infer<typeof Story>;

/* ---------- Desk agent outputs ---------- */

export const CandidateItem = z.object({
  id: z.string(),
  headline: z.string(),
  summary: z.string().describe("Two to four sentences: what happened, according to whom"),
  event_date: z.string(),
  sources: z.array(Source),
  evidence_type: EvidenceType,
  geographic_region: Region,
  significance: z.number().describe("1 (minor) to 5 (front-page candidate)"),
  significance_rationale: z.string(),
  suggested_section: Section,
  candidate_visual_data: z.string().describe("Any numbers, dates or comparisons in the sources that could support a chart, with their citation. Empty if none"),
});
export type CandidateItem = z.infer<typeof CandidateItem>;

export const SearchLogEntry = z.object({
  query: z.string(),
  useful: z.boolean(),
});

export const CollectorOutput = z.object({
  desk: z.string(),
  window_start: z.string(),
  window_end: z.string(),
  items: z.array(CandidateItem),
  coverage_notes: z.string().describe("What was scanned, which regions came up empty, what was deliberately excluded"),
  no_material_update: z.array(z.string()).describe("Tracked organisations or topics with nothing meaningful this week"),
});
export type CollectorOutput = z.infer<typeof CollectorOutput>;

export const VerificationEntry = z.object({
  item_id: z.string(),
  status: z.enum(["approved", "revised", "dropped"]),
  claims_checked: z.number(),
  claims_confirmed: z.number(),
  notes: z.string().describe("What was checked, what changed, why an item was dropped"),
});

export const VerifierOutput = z.object({
  desk: z.string(),
  stories: z.array(Story),
  verification_log: z.array(VerificationEntry),
  tone_notes: z.string().describe("Style edits applied to meet house voice"),
  flags_for_editor: z.array(z.string()).describe("Anything the editor-in-chief must decide, e.g. overlap with another desk"),
});
export type VerifierOutput = z.infer<typeof VerifierOutput>;

export const GraphicsOutput = z.object({
  desk: z.string(),
  visuals: z.array(
    z.object({
      story_id: z.string(),
      visual: Visual,
      rationale: z.string().describe("Why this visual communicates information rather than decorates"),
    }),
  ),
  declined: z.array(
    z.object({ story_id: z.string(), reason: z.string() }),
  ).describe("Stories that were considered and deliberately given no visual"),
});
export type GraphicsOutput = z.infer<typeof GraphicsOutput>;

/* ---------- Issue-level outputs ---------- */

export const BriefRow = z.object({
  signal: z.string(),
  what_happened: z.string(),
  why_it_matters: z.string(),
  story_id: z.string().describe("Related story id, or empty"),
});

export const CompanyUpdate = z.object({
  organization: z.string(),
  status: z.enum(["update", "no_material_update"]),
  what_happened: z.string(),
  strategic_significance: z.string(),
  learning_implication: z.string(),
  watch_next: z.string(),
  story_id: z.string().describe("Related story id when the update is covered by a story, else empty"),
});

export const Opportunity = z.object({
  title: z.string(),
  kind: z.enum(["conference", "fellowship", "grant", "research", "call_for_papers", "competition", "accelerator", "workshop", "course", "dataset", "open_source", "other"]),
  deadline: z.string().describe("Deadline or event date, ISO 8601 when known"),
  location: z.string().describe("City and country, or 'Virtual'"),
  who_for: z.string(),
  why_worth_knowing: z.string(),
  url: z.string(),
});

export const GlossaryTerm = z.object({
  term: z.string(),
  definition: z.string(),
  why_it_matters: z.string(),
});

export const EditorOutput = z.object({
  front_page_story_ids: z.array(z.string()).describe("4 to 6 story ids in order; the first is the lead"),
  lead_story_id: z.string(),
  executive_brief: z.array(BriefRow),
  company_watch: z.array(CompanyUpdate),
  market_signal_of_the_week: z.string(),
  dropped_story_ids: z.array(z.string()).describe("Stories removed for duplication or weak evidence"),
  drop_reasons: z.array(z.object({ story_id: z.string(), reason: z.string() })),
  section_order_notes: z.string(),
  qa_report: z.array(z.object({ check: z.string(), passed: z.boolean(), note: z.string() })),
  geographic_balance_note: z.string(),
});
export type EditorOutput = z.infer<typeof EditorOutput>;

export const PaperOfTheWeek = z.object({
  story_id: z.string(),
  research_question: z.string(),
  population_sample: z.string(),
  method: z.string(),
  key_finding: z.string(),
  effect_size: z.string(),
  limitations: z.string(),
  why_it_matters: z.string(),
  implications: z.string().describe("Implications for practice and product design"),
  paper_url: z.string(),
});

export const CognitiveScienceCorner = z.object({
  concept: z.string(),
  what_it_is: z.string(),
  simple_example: z.string(),
  important_evidence: z.string(),
  common_misconception: z.string(),
  application_to_education: z.string(),
  ai_strengthen_or_undermine: z.string(),
  sources: z.array(Source),
});

export const BuildersCorner = z.object({
  product_principles: z.array(z.object({ principle: z.string(), grounding: z.string().describe("Which story or study this week supports it") })),
  emerging_opportunity: z.string(),
  experiment_worth_running: z.string(),
  suggested_metrics: z.array(z.string()),
  research_question: z.string(),
  contrarian_question: z.string(),
  evidence_vs_hypothesis_note: z.string(),
});

export const ColumnistOutput = z.object({
  paper_of_the_week: PaperOfTheWeek,
  cognitive_science_corner: CognitiveScienceCorner,
  builders_corner: BuildersCorner,
  glossary: z.array(GlossaryTerm),
  editorial: z.object({
    headline: z.string(),
    deck: z.string(),
    body: z.string().describe("700 to 1,000 words of prose paragraphs separated by blank lines"),
    question_for_the_community: z.string(),
  }),
});
export type ColumnistOutput = z.infer<typeof ColumnistOutput>;

/* ---------- The assembled issue ---------- */

export const Issue = z.object({
  id: z.string().describe("YYYY-MM-DD of the issue date"),
  issue_number: z.number(),
  masthead: z.object({
    name: z.string(),
    tagline: z.string(),
    issue_date: z.string(),
    window_start: z.string(),
    window_end: z.string(),
    estimated_reading_minutes: z.number(),
  }),
  front_page: z.array(Story),
  lead_story_id: z.string(),
  executive_brief: z.array(BriefRow),
  sections: z.array(
    z.object({
      section: Section,
      title: z.string(),
      stories: z.array(Story),
    }),
  ),
  company_watch: z.array(CompanyUpdate),
  market_signal_of_the_week: z.string(),
  paper_of_the_week: PaperOfTheWeek,
  cognitive_science_corner: CognitiveScienceCorner,
  opportunities: z.array(Opportunity),
  builders_corner: BuildersCorner,
  glossary: z.array(GlossaryTerm),
  editorial: ColumnistOutput.shape.editorial,
  qa_report: EditorOutput.shape.qa_report,
  generated_at: z.string(),
  run_id: z.string(),
  sample: z.boolean().describe("True when produced in mock mode for layout testing; nothing in it is real news"),
});
export type Issue = z.infer<typeof Issue>;

export const OpportunityDeskOutput = z.object({
  desk: z.string(),
  opportunities: z.array(Opportunity),
  verification_log: z.array(VerificationEntry),
  flags_for_editor: z.array(z.string()),
});
export type OpportunityDeskOutput = z.infer<typeof OpportunityDeskOutput>;
