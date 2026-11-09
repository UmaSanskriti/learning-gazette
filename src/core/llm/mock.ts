import type { z } from "zod";
import type { AgentCallbacks, AgentRequest, AgentResult, Provider } from "./provider.ts";
import type {
  CollectorOutput, ColumnistOutput, EditorOutput, GraphicsOutput, OpportunityDeskOutput, Source, Story, VerifierOutput, Visual,
} from "../schema.ts";
import { loadConfig } from "../config.ts";

/**
 * Mock provider for demos and UI development. It never calls the API. Every
 * output is clearly labelled as sample content and uses example.com URLs, so a
 * demo issue cannot be mistaken for real news.
 */
export class MockProvider implements Provider {
  readonly name = "mock";
  private delay: number;

  constructor(delayMs = Number(process.env.MOCK_DELAY_MS ?? 350)) {
    this.delay = delayMs;
  }

  async run<T>(req: AgentRequest, schema: z.ZodType<T>, cb: AgentCallbacks): Promise<AgentResult<T>> {
    const steps = scriptFor(req);
    for (const [kind, text] of steps) {
      if (cb.signal?.aborted) throw new Error("cancelled");
      await sleep(this.delay + Math.random() * this.delay);
      cb.log(kind, text);
    }
    cb.usage(
      { input_tokens: 9000 + Math.floor(Math.random() * 20000), output_tokens: 2500 + Math.floor(Math.random() * 6000), cache_read_input_tokens: 1800, cache_creation_input_tokens: 0 },
      req.model,
    );
    const output = fixtureFor(req);
    const parsed = schema.safeParse(output);
    if (!parsed.success) {
      throw new Error(`Mock fixture for ${req.nodeId} does not match schema: ` + parsed.error.issues.slice(0, 5).map((i) => i.path.join(".") + " " + i.message).join("; "));
    }
    return { output: parsed.data, rawText: JSON.stringify(output) };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function scriptFor(req: AgentRequest): [AgentCallbacks["log"] extends (k: infer K, t: string) => void ? K : never, string][] {
  const d = req.deskId ?? "";
  switch (req.role) {
    case "collector":
      return [
        ["thinking", `Planning searches for the ${d} desk across regions and primary sources.`],
        ["search", `${d} news this week site:example.com`],
        ["result", "10 search results"],
        ["search", `${d} announcement primary source`],
        ["result", "10 search results"],
        ["fetch", "https://example.com/primary-source"],
        ["result", "fetched https://example.com/primary-source"],
        ["text", "Compiling candidate items with sources and significance scores."],
      ];
    case "verifier":
      return [
        ["thinking", "Opening each cited source to confirm the central claims."],
        ["fetch", "https://example.com/primary-source"],
        ["result", "fetched https://example.com/primary-source"],
        ["search", "independent confirmation of sample item"],
        ["result", "10 search results"],
        ["text", "Two items approved, one revised for evidence labelling, one dropped as outside the window."],
      ];
    case "graphics":
      return [
        ["thinking", "Checking which stories carry cited numbers that a chart would communicate better than prose."],
        ["text", "Proposing one visual with cited data; declining the rest."],
      ];
    case "editor":
      return [
        ["thinking", "Ranking stories against the front-page criteria and checking for duplicates across desks."],
        ["text", "Selected five front-page stories, wrote the executive brief and Company Watch, filed QA report."],
      ];
    case "columnist":
      return [
        ["thinking", "Choosing a cognitive-science concept not covered recently and drafting the editorial."],
        ["search", "sample paper effect size"],
        ["result", "10 search results"],
        ["text", "Editorial, Paper of the Week, Builder's Corner and glossary drafted."],
      ];
  }
}

/* ---------------- fixtures ---------------- */

const src = (title: string, kind: Source["kind"] = "primary"): Source => ({
  title, url: "https://example.com/" + slug(title), publisher: "Example Organisation (sample)", kind, date: "2026-09-21",
});

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const SAMPLE_BODY =
  "This paragraph stands in for a verified story body produced in mock mode. In a real run the verifier agent writes 150 to 400 words here in the house voice, after opening the collector's cited sources and confirming each central claim. Company-reported results are labelled as such, correlation is not described as causation, and preprints are distinguished from peer-reviewed work.\n\nA second paragraph typically carries the detail: who acted, what changed, for whom, and what the primary source actually says. Editorial interpretation is kept out of the body and placed in the labelled fields that follow, so readers can always tell reporting from analysis.\n\nNothing in this sample issue is real news. It exists so club leaders can test the dashboard and the newspaper layout without spending API credit.";

const DESK_SECTIONS: Record<string, Story["section"]> = {
  "ai-edtech": "company_watch", research: "research_review", capital: "startup_capital", policy: "policy_governance",
  world: "world_education", "higher-ed": "higher_education", k12: "k12", harvard: "harvard_watch", social: "social_signal",
};

const DESK_REGION: Record<string, Story["geographic_region"]> = {
  "ai-edtech": "north_america", research: "europe", capital: "south_asia", policy: "africa",
  world: "latin_america_caribbean", "higher-ed": "oceania", k12: "east_southeast_asia", harvard: "north_america", social: "global",
};

function sampleStory(desk: string, i: number): Story {
  const cfg = loadConfig();
  const name = cfg.desks.find((d) => d.id === desk)?.name ?? desk;
  return {
    id: `${desk}-sample-${i}`,
    section: DESK_SECTIONS[desk] ?? "world_education",
    headline: `[Sample] ${name}: story ${i} of the demo issue`,
    deck: "A one-sentence deck explains what happened and why a reader should care.",
    body: SAMPLE_BODY,
    why_it_matters: "Sample analysis: this field explains consequences for learners, teachers or institutions, clearly separated from the reported facts.",
    watch_next: "Sample: the next decision, dataset or deadline to watch.",
    evidence_note: i === 1 ? "Sample evidence note: results are company-reported; n = 1,200 students across 14 schools; no control group." : "",
    sources: [src(`${name} primary source ${i}`), src(`${name} independent coverage ${i}`, "secondary")],
    visual: null,
    tags: desk === "social" ? ["sample", i === 1 ? "linkedin" : "x"] : ["sample", desk],
    evidence_type: desk === "social" ? "social_post" : i === 1 ? "company_reported_results" : "peer_reviewed",
    geographic_region: DESK_REGION[desk] ?? "global",
    event_date: "2026-09-2" + i,
    is_background: false,
  };
}

const VISUAL_BASE = {
  headline: "", what_it_shows: "", source: "Example dataset 2026 (sample)", source_url: "https://example.com/dataset",
  alt_text: "", placement: "after paragraph 1", unit: "", data_points: [], timeline: [], steps: [], columns: [], rows: [],
  key_number: "", key_number_context: "", quote: "", attribution: "",
};

function sampleVisual(desk: string): Visual {
  const v = (partial: Partial<Visual>): Visual => ({ ...VISUAL_BASE, ...partial } as Visual);
  switch (desk) {
    case "ai-edtech":
      return v({
        visual_type: "bar", headline: "Sample: weekly AI use is already mainstream among surveyed students", unit: "%",
        what_it_shows: "Share of surveyed students reporting weekly or more frequent AI chatbot use for learning, by region (sample data).",
        alt_text: "Bar chart of sample survey data showing weekly AI use between 31 and 58 percent across five regions.",
        data_points: [
          { label: "North America", value: 52, series: "Weekly use" }, { label: "Europe", value: 44, series: "Weekly use" },
          { label: "East Asia", value: 58, series: "Weekly use" }, { label: "Latin America", value: 39, series: "Weekly use" },
          { label: "Africa", value: 31, series: "Weekly use" },
        ],
      });
    case "research":
      return v({
        visual_type: "process_flow", headline: "Sample: how the study separated aided from unaided performance",
        what_it_shows: "Study design as a sequence of phases (sample).",
        alt_text: "Four-step diagram: baseline test, four weeks of practice with or without AI, unaided post-test, delayed retention test.",
        steps: [
          { title: "Baseline", detail: "Unaided pre-test for all participants" }, { title: "Practice", detail: "Randomised to AI-assisted or unassisted practice" },
          { title: "Post-test", detail: "Unaided assessment immediately after" }, { title: "Retention", detail: "Delayed test three weeks later" },
        ],
      });
    case "capital":
      return v({
        visual_type: "horizontal_bar", headline: "Sample: this week's largest disclosed rounds", unit: "USD millions",
        what_it_shows: "Disclosed funding rounds in edtech this week (sample data).",
        alt_text: "Horizontal bar chart of five sample funding rounds between 12 and 85 million dollars.",
        data_points: [
          { label: "Company A", value: 85, series: "Round size" }, { label: "Company B", value: 40, series: "Round size" },
          { label: "Company C", value: 25, series: "Round size" }, { label: "Company D", value: 18, series: "Round size" }, { label: "Company E", value: 12, series: "Round size" },
        ],
      });
    case "policy":
      return v({
        visual_type: "timeline", headline: "Sample: the rule takes effect in stages over eighteen months",
        what_it_shows: "Key dates in the sample regulation's implementation.",
        alt_text: "Timeline of four dated milestones from adoption to full enforcement.",
        timeline: [
          { date: "2026-09-18", label: "Adopted", detail: "Final text published" }, { date: "2027-01-01", label: "Guidance", detail: "Implementing guidance due" },
          { date: "2027-09-01", label: "Schools", detail: "Applies to primary and secondary schools" }, { date: "2028-03-01", label: "Enforcement", detail: "Penalties in force" },
        ],
      });
    case "world":
      return v({
        visual_type: "line", headline: "Sample: foundational reading proficiency has recovered slowly since 2021", unit: "%",
        what_it_shows: "Share of grade-3 pupils meeting the reading benchmark, 2019 to 2026 (sample data).",
        alt_text: "Line chart showing sample reading proficiency falling from 61 to 49 percent in 2021 and recovering to 57 percent by 2026.",
        data_points: [
          { label: "2019", value: 61, series: "Proficient" }, { label: "2021", value: 49, series: "Proficient" }, { label: "2023", value: 52, series: "Proficient" },
          { label: "2025", value: 55, series: "Proficient" }, { label: "2026", value: 57, series: "Proficient" },
        ],
      });
    case "higher-ed":
      return v({
        visual_type: "comparison_table", headline: "Sample: three assessment responses universities are choosing between",
        what_it_shows: "How oral exams, supervised writing and AI-permitted coursework compare (sample).",
        alt_text: "Table comparing three assessment approaches on cost, scalability and what they measure.",
        columns: ["Oral exams", "Supervised writing", "AI-permitted coursework"],
        rows: [
          { dimension: "What it measures", values: ["Unaided understanding", "Unaided writing", "Process and judgement"] },
          { dimension: "Cost to scale", values: ["High", "Medium", "Low"] },
          { dimension: "Evidence base", values: ["Long-standing", "Long-standing", "Emerging"] },
        ],
      });
    case "k12":
      return v({
        visual_type: "key_number", headline: "Sample: one in three surveyed teachers used an AI tool to plan a lesson last week",
        what_it_shows: "Headline statistic from a sample survey.", alt_text: "Key number: 34 percent of teachers.",
        key_number: "34%", key_number_context: "of 2,400 surveyed teachers used an AI tool for lesson planning in the past week (sample data)",
      });
    default:
      return v({
        visual_type: "pull_quote", headline: "Sample pull quote", what_it_shows: "A decisive sentence from a primary source.",
        alt_text: "Pull quote from a sample source.", quote: "The question is not whether students will use these tools, but whether they will still be able to think without them.",
        attribution: "Sample source, primary document (mock mode)",
      });
  }
}

function fixtureFor(req: AgentRequest): unknown {
  const desk = req.deskId ?? "";
  const cfg = loadConfig();
  const deskCfg = cfg.desks.find((d) => d.id === desk);
  switch (req.role) {
    case "collector": {
      const out: CollectorOutput = {
        desk, window_start: "", window_end: "",
        items: [1, 2, 3].map((i) => ({
          id: `${desk}-sample-${i}`, headline: `[Sample] candidate ${i} for ${deskCfg?.name ?? desk}`,
          summary: "Sample candidate summary: what happened, according to whom, and when. Mock mode produces no real items.",
          event_date: "2026-09-2" + i, sources: [src(`candidate ${i} source`)], evidence_type: "journalism",
          geographic_region: DESK_REGION[desk] ?? "global", significance: i === 1 ? 5 : 3,
          significance_rationale: "Sample rationale.", suggested_section: DESK_SECTIONS[desk] ?? "opportunity_board",
          candidate_visual_data: i === 1 ? "Sample: 46% weekly use (Example dataset 2026)" : "",
        })),
        coverage_notes: "Sample coverage notes: scanned primary sources across all regions; Oceania produced nothing material.",
        no_material_update: desk === "ai-edtech" ? ["Meta", "Coursera"] : [],
      };
      return out;
    }
    case "verifier": {
      if (deskCfg?.kind === "opportunities") {
        const out: OpportunityDeskOutput = {
          desk,
          opportunities: [
            { title: "[Sample] International Conference on AI in Education: call for papers", kind: "call_for_papers", deadline: "2026-11-15", location: "Virtual", who_for: "Researchers and graduate students", why_worth_knowing: "Sample: the main venue for AI-and-learning research.", url: "https://example.com/aied-cfp" },
            { title: "[Sample] Learning Science Fellowship", kind: "fellowship", deadline: "2026-12-01", location: "Cambridge, United States", who_for: "Doctoral students in education or cognitive science", why_worth_knowing: "Sample: funded year with a lab placement.", url: "https://example.com/fellowship" },
            { title: "[Sample] Open dataset of tutoring dialogues", kind: "dataset", deadline: "", location: "Virtual", who_for: "Builders and researchers", why_worth_knowing: "Sample: a public dataset for evaluating tutoring systems.", url: "https://example.com/dataset" },
            { title: "[Sample] EdTech accelerator autumn cohort", kind: "accelerator", deadline: "2026-10-20", location: "Nairobi, Kenya", who_for: "Early-stage founders", why_worth_knowing: "Sample: focused on foundational learning.", url: "https://example.com/accelerator" },
            { title: "[Sample] Workshop on assessment design in the age of AI", kind: "workshop", deadline: "2026-10-05", location: "Virtual", who_for: "Faculty and instructional designers", why_worth_knowing: "Sample: practical redesign templates.", url: "https://example.com/workshop" },
          ],
          verification_log: [{ item_id: "opportunities-sample-1", status: "approved", claims_checked: 5, claims_confirmed: 5, notes: "Sample: deadlines confirmed on official pages." }],
          flags_for_editor: [],
        };
        return out;
      }
      const out: VerifierOutput = {
        desk,
        stories: [sampleStory(desk, 1), sampleStory(desk, 2)],
        verification_log: [
          { item_id: `${desk}-sample-1`, status: "approved", claims_checked: 4, claims_confirmed: 4, notes: "Sample: all claims confirmed against the primary source." },
          { item_id: `${desk}-sample-2`, status: "revised", claims_checked: 3, claims_confirmed: 2, notes: "Sample: one figure could not be confirmed and was removed." },
          { item_id: `${desk}-sample-3`, status: "dropped", claims_checked: 1, claims_confirmed: 0, notes: "Sample: outside the coverage window." },
        ],
        tone_notes: "Sample: removed promotional language; labelled company-reported results.",
        flags_for_editor: desk === "ai-edtech" ? ["Sample: story 1 overlaps with a K-12 desk item; editor to choose."] : [],
      };
      return out;
    }
    case "graphics": {
      const out: GraphicsOutput = {
        desk,
        visuals: [{ story_id: `${desk}-sample-1`, visual: sampleVisual(desk), rationale: "Sample: the story's cited numbers are easier to compare as a chart than as prose." }],
        declined: [{ story_id: `${desk}-sample-2`, reason: "Sample: no data that a visual would communicate better than the prose." }],
      };
      return out;
    }
    case "editor": {
      const storyDesks = cfg.desks.filter((d) => d.kind === "stories").map((d) => d.id);
      const out: EditorOutput = {
        front_page_story_ids: storyDesks.slice(0, 5).map((d) => `${d}-sample-1`),
        lead_story_id: `${storyDesks[0]}-sample-1`,
        executive_brief: storyDesks.slice(0, 8).map((d) => ({
          signal: `[Sample] ${cfg.desks.find((x) => x.id === d)?.name}`, what_happened: "Sample: one line of what happened.",
          why_it_matters: "Sample: one line of why it matters.", story_id: `${d}-sample-1`,
        })),
        company_watch: cfg.tracked_organizations.map((o, i) => ({
          organization: o, status: i % 3 === 2 ? "no_material_update" : "update",
          what_happened: i % 3 === 2 ? "" : "Sample: a product or policy move this week.",
          strategic_significance: i % 3 === 2 ? "" : "Sample: what it signals about the company's education strategy.",
          learning_implication: i % 3 === 2 ? "" : "Sample: what changes for learners or teachers.",
          watch_next: i % 3 === 2 ? "" : "Sample: the next thing to watch.", story_id: i === 0 ? "ai-edtech-sample-1" : "",
        })),
        market_signal_of_the_week: "Sample market signal: this week's deals cluster around assessment integrity and teacher-facing tooling rather than student-facing tutors.",
        dropped_story_ids: ["k12-sample-2"],
        drop_reasons: [{ story_id: "k12-sample-2", reason: "Sample: duplicates the AI & EdTech desk item." }],
        section_order_notes: "Sample: policy runs before research this week because of the lead story.",
        qa_report: [
          { check: "Most stories are from the requested week", passed: true, note: "Sample." },
          { check: "Issue is globally balanced", passed: true, note: "Sample: six regions represented." },
          { check: "Major non-AI education developments included", passed: true, note: "Sample." },
          { check: "Company claims labelled", passed: true, note: "Sample." },
          { check: "No duplicated stories", passed: false, note: "Sample: one duplicate removed; check K-12 section wording." },
        ],
        geographic_balance_note: "Sample: no single country dominates the front page.",
      };
      return out;
    }
    case "columnist": {
      const out: ColumnistOutput = {
        paper_of_the_week: {
          story_id: "research-sample-1", research_question: "Sample: does AI-assisted practice improve unaided performance?",
          population_sample: "Sample: 1,200 secondary students in 14 schools", method: "Sample: randomised controlled trial with delayed retention test",
          key_finding: "Sample: gains during practice did not persist on the unaided post-test.", effect_size: "Sample: d = 0.05 (unaided), d = 0.41 (aided)",
          limitations: "Sample: one subject, one country, four-week duration.", why_it_matters: "Sample: distinguishes performance from learning.",
          implications: "Sample: measure unaided performance as a product metric.", paper_url: "https://example.com/paper",
        },
        cognitive_science_corner: {
          concept: "Desirable difficulties (sample)", what_it_is: "Sample: conditions that make practice harder but improve long-term retention and transfer.",
          simple_example: "Sample: testing yourself instead of rereading.", important_evidence: "Sample: decades of laboratory and classroom studies on retrieval practice and spacing.",
          common_misconception: "Sample: that difficulty during learning signals poor teaching.", application_to_education: "Sample: build quizzes and spaced review into courses.",
          ai_strengthen_or_undermine: "Sample: AI can schedule spacing well but can also remove the difficulty by answering too readily.",
          sources: [src("Sample review on desirable difficulties")],
        },
        builders_corner: {
          product_principles: [
            { principle: "Sample: measure unaided performance, not just task completion.", grounding: "research-sample-1" },
            { principle: "Sample: give teachers control over when AI assists.", grounding: "k12-sample-1" },
            { principle: "Sample: make help effortful by default.", grounding: "research-sample-1" },
          ],
          emerging_opportunity: "Sample: assessment tools that log process, not only product.",
          experiment_worth_running: "Sample: A/B test delayed hints against immediate answers on a delayed retention measure.",
          suggested_metrics: ["Sample: unaided post-test score", "Sample: retention at three weeks", "Sample: help requests per problem"],
          research_question: "Sample: which forms of AI help transfer to unaided performance?",
          contrarian_question: "Sample: if a tutor makes homework easy, who is it for?",
          evidence_vs_hypothesis_note: "Sample: principles 1 and 3 rest on this week's RCT; principle 2 is a product hypothesis.",
        },
        glossary: [
          { term: "Unaided performance (sample)", definition: "Sample: what a learner can do without tools or help.", why_it_matters: "Sample: the outcome that transfers." },
          { term: "Retention interval (sample)", definition: "Sample: the delay between learning and testing.", why_it_matters: "Sample: short delays flatter interventions." },
          { term: "Desirable difficulty (sample)", definition: "Sample: effortful conditions that improve long-term learning.", why_it_matters: "Sample: guides product design." },
          { term: "Digital sovereignty (sample)", definition: "Sample: a state's control over its data and infrastructure.", why_it_matters: "Sample: shapes edtech procurement." },
          { term: "Oral assessment (sample)", definition: "Sample: examination by spoken dialogue.", why_it_matters: "Sample: resistant to AI ghost-writing." },
        ],
        editorial: {
          headline: "[Sample] The week the question changed",
          deck: "A sample editorial standing in for the 700 to 1,000 word synthesis the columnist writes in a real run.",
          body: "This is a sample editorial produced in mock mode. In a real run the columnist agent synthesizes the week rather than recapping it: a pattern connecting otherwise independent developments, an emerging tension, second-order implications, what may happen next, and one question the education community should be asking.\n\nThe editorial is the intellectual signature of the publication, so it is held to the same evidence standard as the reporting: claims are grounded in the issue's stories and studies, and interpretation is presented as interpretation.\n\nNothing here is real news.",
          question_for_the_community: "Sample: what would we need to measure to know whether AI tutoring improves learning rather than performance?",
        },
      };
      return out;
    }
  }
}
