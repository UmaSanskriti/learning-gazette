import type { PublicationConfig } from "../config.ts";
import type { Issue, Story } from "../schema.ts";
import { esc, renderVisual } from "./charts.ts";
import { ISSUE_CSS, ISSUE_JS } from "./styles.ts";

export interface RenderOptions {
  sitePath: string;
}

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">`;

const REGION_LABEL: Record<string, string> = {
  global: "Global", north_america: "North America", latin_america_caribbean: "Latin America & Caribbean", europe: "Europe", africa: "Africa",
  middle_east_north_africa: "Middle East & North Africa", south_asia: "South Asia", east_southeast_asia: "East & Southeast Asia", oceania: "Oceania",
};
const EVIDENCE_LABEL: Record<string, string> = {
  peer_reviewed: "Peer-reviewed", preprint: "Preprint", government_or_regulator: "Government / regulator", intergovernmental_report: "Intergovernmental report",
  university_or_lab: "University / lab", company_announcement: "Company announcement", company_reported_results: "Company-reported results", journalism: "Journalism",
  dataset: "Dataset", event_or_opportunity: "Event", social_post: "Social post (opinion)", editorial_analysis: "Analysis",
};

const PLATFORMS: [RegExp, string][] = [
  [/(^|\.)x\.com$|(^|\.)twitter\.com$/, "X"], [/(^|\.)linkedin\.com$/, "LinkedIn"], [/(^|\.)bsky\.app$/, "Bluesky"],
  [/(^|\.)threads\.(net|com)$/, "Threads"], [/(^|\.)reddit\.com$/, "Reddit"], [/(^|\.)substack\.com$/, "Substack"], [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "YouTube"],
];

function platformsOf(s: Story): string[] {
  const found = new Set<string>();
  for (const src of s.sources) {
    try {
      const host = new URL(src.url).hostname.replace(/^www\./, "");
      for (const [re, name] of PLATFORMS) if (re.test(host)) found.add(name);
    } catch { /* ignore bad urls */ }
  }
  for (const t of s.tags) {
    const k = t.toLowerCase();
    if (k === "x" || k === "twitter") found.add("X");
    if (k === "linkedin") found.add("LinkedIn");
  }
  return [...found];
}

const paras = (text: string) => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

function longDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function shortDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function labelled(lbl: string, text: string, cls = ""): string {
  return text?.trim() ? `<div class="labelled ${cls}"><span class="lbl">${lbl}</span><p>${esc(text)}</p></div>` : "";
}

function storyHtml(s: Story, opts: { lead?: boolean; kicker?: string; showVisual?: boolean } = {}): string {
  const visual = opts.showVisual !== false && s.visual ? renderVisual(s.visual) : "";
  const sources = s.sources.length
    ? `<ul class="sources">${s.sources.map((src) => `<li><a href="${esc(src.url)}" rel="noopener">${esc(src.title)}</a> <span class="src-kind">· ${esc(src.publisher)}${src.kind === "primary" ? " · primary" : ""}${src.date ? " · " + esc(src.date) : ""}</span></li>`).join("")}</ul>`
    : "";
  const meta = `<div class="meta-row"><span>${esc(REGION_LABEL[s.geographic_region] ?? s.geographic_region)}</span><span>${esc(EVIDENCE_LABEL[s.evidence_type] ?? s.evidence_type)}</span>${s.is_background ? "<span>Background</span>" : ""}${s.event_date ? `<span>${esc(s.event_date)}</span>` : ""}</div>`;
  const body = `<div class="body">${paras(s.body)}</div>`;
  const analysis = labelled("Why it matters", s.why_it_matters) + labelled("Evidence note", s.evidence_note, "evidence") + labelled("Watch next", s.watch_next);
  if (s.section === "social_signal" && !opts.kicker) {
    const p = platformsOf(s);
    opts = { ...opts, kicker: p.length ? `On ${p.join(" and ")}` : "Social" };
  }
  if (opts.lead) {
    return `<article class="story lead" id="story-${esc(s.id)}">
  ${opts.kicker ? `<p class="kicker">${esc(opts.kicker)}</p>` : ""}
  <h3>${esc(s.headline)}</h3>
  <p class="deck">${esc(s.deck)}</p>
  <div class="lead-layout"><div>${body}${analysis}${sources}${meta}</div><div>${visual}</div></div>
</article>`;
  }
  return `<article class="story" id="story-${esc(s.id)}">
  ${opts.kicker ? `<p class="kicker">${esc(opts.kicker)}</p>` : ""}
  <h3>${esc(s.headline)}</h3>
  <p class="deck">${esc(s.deck)}</p>
  ${visual}
  ${body}
  ${analysis}
  ${sources}
  ${meta}
</article>`;
}

function sectionHead(id: string, title: string, note = ""): string {
  return `<div class="sec-head" id="${id}"><h2>${esc(title)}</h2>${note ? `<span class="sec-note">${esc(note)}</span>` : ""}</div>`;
}

export function renderIssueHtml(issue: Issue, opts: RenderOptions): string {
  const m = issue.masthead;
  const lead = issue.front_page[0];
  const rest = issue.front_page.slice(1);
  const contents: [string, string][] = [
    ["front", "Front page"], ["brief", "Executive brief"],
    ...issue.sections.map((s) => [s.section, s.title] as [string, string]),
    ["companies", "Company watch"], ["paper", "Paper of the week"], ["concept", "Cognitive science"],
    ["opportunities", "Opportunities"], ["builders", "Builder's corner"], ["glossary", "Glossary"], ["editorial", "Editorial"],
  ];

  const front = `<section class="sec" id="front">
  ${lead ? storyHtml(lead, { lead: true, kicker: "Lead story" }) : ""}
  <div class="front-grid">${rest.map((s) => storyHtml(s, { kicker: "Front page" })).join("")}</div>
</section>`;

  const brief = `<section class="sec">${sectionHead("brief", "Executive Brief", "The week in two minutes")}
<table class="brief"><thead><tr><th>Signal</th><th>What happened</th><th>Why it matters</th></tr></thead><tbody>
${issue.executive_brief.map((r) => `<tr><td>${r.story_id ? `<a href="#story-${esc(r.story_id)}">${esc(r.signal)}</a>` : esc(r.signal)}</td><td>${esc(r.what_happened)}</td><td>${esc(r.why_it_matters)}</td></tr>`).join("")}
</tbody></table></section>`;

  const sections = issue.sections
    .map((sec) => `<section class="sec">${sectionHead(sec.section, sec.title, sec.section === "social_signal" ? "What educators, researchers and builders were discussing on X and LinkedIn. Posts are opinions, attributed and labelled; claims in them are checked or marked unverified." : "")}${sec.stories.map((s) => storyHtml(s)).join("")}</section>`)
    .join("");

  const companies = `<section class="sec">${sectionHead("companies", "Company Watch")}
<div class="companies">${issue.company_watch.map((c) =>
    c.status === "no_material_update"
      ? `<div class="company quiet"><h4>${esc(c.organization)}</h4><span class="quiet-note">No material update this week</span></div>`
      : `<div class="company"><h4>${esc(c.organization)}</h4>
<p><span class="lbl">What happened</span>${esc(c.what_happened)}${c.story_id ? ` <a href="#story-${esc(c.story_id)}">See story</a>` : ""}</p>
<p><span class="lbl">Strategic significance</span>${esc(c.strategic_significance)}</p>
<p><span class="lbl">Learning implication</span>${esc(c.learning_implication)}</p>
<p><span class="lbl">Watch next</span>${esc(c.watch_next)}</p></div>`,
  ).join("")}</div>
${issue.market_signal_of_the_week ? `<div class="signal"><span class="lbl">Market signal of the week</span>${esc(issue.market_signal_of_the_week)}</div>` : ""}
</section>`;

  const p = issue.paper_of_the_week;
  const paper = `<section class="sec">${sectionHead("paper", "Paper of the Week")}
<div class="paper">
<div class="wide"><span class="lbl">Research question</span>${esc(p.research_question)}</div>
<div><span class="lbl">Population and sample</span>${esc(p.population_sample)}</div>
<div><span class="lbl">Method</span>${esc(p.method)}</div>
<div class="wide"><span class="lbl">Key finding</span>${esc(p.key_finding)}</div>
<div><span class="lbl">Effect size</span>${esc(p.effect_size)}</div>
<div><span class="lbl">Limitations</span>${esc(p.limitations)}</div>
<div><span class="lbl">Why it matters</span>${esc(p.why_it_matters)}</div>
<div><span class="lbl">Implications for practice and product</span>${esc(p.implications)}</div>
<div class="wide"><span class="lbl">Paper</span><a href="${esc(p.paper_url)}" rel="noopener">${esc(p.paper_url)}</a>${p.story_id ? ` · <a href="#story-${esc(p.story_id)}">Read our story</a>` : ""}</div>
</div></section>`;

  const c = issue.cognitive_science_corner;
  const concept = `<section class="sec">${sectionHead("concept", "Cognitive Science Corner", "One concept a week")}
<div class="concept"><h3>${esc(c.concept)}</h3>
<div class="item"><span class="lbl">What it is</span>${esc(c.what_it_is)}</div>
<div class="item"><span class="lbl">A simple example</span>${esc(c.simple_example)}</div>
<div class="item"><span class="lbl">Important evidence</span>${esc(c.important_evidence)}</div>
<div class="item"><span class="lbl">Common misconception</span>${esc(c.common_misconception)}</div>
<div class="item"><span class="lbl">How it applies to education</span>${esc(c.application_to_education)}</div>
<div class="item"><span class="lbl">How AI might strengthen or undermine it</span>${esc(c.ai_strengthen_or_undermine)}</div>
${c.sources.length ? `<ul class="sources">${c.sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.title)}</a> <span class="src-kind">· ${esc(s.publisher)}</span></li>`).join("")}</ul>` : ""}
</div></section>`;

  const opps = `<section class="sec">${sectionHead("opportunities", "Opportunity Board", "Open as of the issue date")}
<table class="opps"><thead><tr><th>Opportunity</th><th>Deadline</th><th>Where</th><th>Who it is for</th><th>Why it is worth knowing</th></tr></thead><tbody>
${issue.opportunities.map((o) => `<tr><td><span class="kind">${esc(o.kind.replace(/_/g, " "))}</span><a href="${esc(o.url)}" rel="noopener">${esc(o.title)}</a></td><td>${esc(o.deadline || "Rolling")}</td><td>${esc(o.location)}</td><td>${esc(o.who_for)}</td><td>${esc(o.why_worth_knowing)}</td></tr>`).join("")}
</tbody></table></section>`;

  const b = issue.builders_corner;
  const builders = `<section class="sec">${sectionHead("builders", "Builder's Corner", "For people building AI products for learning")}
<div class="builder">
<div><h4>Product principles</h4><ol>${b.product_principles.map((x) => `<li>${esc(x.principle)}${x.grounding ? ` <span class="grounding">Grounded in: ${esc(x.grounding)}</span>` : ""}</li>`).join("")}</ol></div>
<div><h4>Emerging opportunity</h4><p>${esc(b.emerging_opportunity)}</p><h4>Experiment worth running</h4><p>${esc(b.experiment_worth_running)}</p></div>
<div><h4>Suggested metrics</h4><ul>${b.suggested_metrics.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
<div><h4>Research question</h4><p>${esc(b.research_question)}</p><h4>Contrarian question</h4><p>${esc(b.contrarian_question)}</p></div>
<div class="wide"><p class="grounding">${esc(b.evidence_vs_hypothesis_note)}</p></div>
</div></section>`;

  const glossary = `<section class="sec">${sectionHead("glossary", "Glossary", "Terms worth learning this week")}
<dl class="glossary">${issue.glossary.map((g) => `<div><dt>${esc(g.term)}</dt><dd>${esc(g.definition)}<span class="why">${esc(g.why_it_matters)}</span></dd></div>`).join("")}</dl></section>`;

  const e = issue.editorial;
  const editorial = `<section class="sec">${sectionHead("editorial", "Editorial")}
<div class="editorial"><h3>${esc(e.headline)}</h3><p class="deck">${esc(e.deck)}</p><div class="body">${paras(e.body)}</div>
${e.question_for_the_community ? `<div class="question">${esc(e.question_for_the_community)}</div>` : ""}</div>
<details class="qa"><summary>Editorial QA report</summary><ul>${issue.qa_report.map((q) => `<li class="${q.passed ? "pass" : "fail"}">${q.passed ? "Pass" : "Needs attention"} · ${esc(q.check)}${q.note ? ` · ${esc(q.note)}` : ""}</li>`).join("")}</ul></details>
</section>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m.name)} · Issue ${issue.issue_number} · ${esc(m.issue_date)}</title>
<meta name="description" content="${esc(m.tagline)}">
${FONTS}
<style>${ISSUE_CSS}</style>
</head>
<body>
${issue.sample ? `<div class="sample-banner">Sample issue generated in mock mode for layout testing. Nothing on this page is real news.</div>` : ""}
<div class="wrap">
<header class="masthead">
  <h1>${esc(m.name)}</h1>
  <p class="tagline">${esc(m.tagline)}</p>
  <div class="meta"><span>${esc(longDate(m.issue_date))}</span><span>Issue ${issue.issue_number}</span><span>Covering ${esc(shortDate(m.window_start))} to ${esc(shortDate(m.window_end))}</span><span>${m.estimated_reading_minutes} minute read</span></div>
</header>
<nav class="contents">${contents.map(([id, t]) => `<a href="#${esc(id)}">${esc(t)}</a>`).join("")}</nav>
${front}
${brief}
${sections}
${companies}
${paper}
${concept}
${opps}
${builders}
${glossary}
${editorial}
<footer class="colophon">
${esc(m.name)} is produced by the ${esc(issue.masthead.name === "The Learning Gazette" ? "Harvard AI in Education Club" : "editorial team")} with an agentic newsroom: desk collectors, verifiers and graphics editors, an editor-in-chief and a columnist. Every story lists its sources; analysis is labelled.<br>
Generated ${esc(issue.generated_at.slice(0, 16).replace("T", " "))} UTC · run ${esc(issue.run_id)} · <a href="${esc(opts.sitePath)}/">All issues</a> · <a href="issue.json">Issue data (JSON)</a>
</footer>
</div>
<script>${ISSUE_JS}</script>
</body>
</html>`;
}

export function renderArchiveHtml(issues: Issue[], opts: RenderOptions & { cfg: PublicationConfig }): string {
  const cfg = opts.cfg;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(cfg.name)} · All issues</title>
${FONTS}
<style>${ISSUE_CSS}</style>
</head>
<body>
<div class="wrap">
<header class="masthead"><h1>${esc(cfg.name)}</h1><p class="tagline">${esc(cfg.tagline)}</p><div class="meta"><span>${esc(cfg.publisher)}</span><span>Weekly, every Friday</span></div></header>
<section class="sec">
<ul class="archive-list">
${issues.map((i) => `<li><div class="date">Issue ${i.issue_number}<br>${esc(longDate(i.id))}${i.sample ? "<br>Sample" : ""}</div><div><h3><a href="${esc(opts.sitePath)}/issues/${esc(i.id)}/">${esc(i.front_page[0]?.headline ?? i.editorial.headline)}</a></h3><p>${esc(i.front_page[0]?.deck ?? i.editorial.deck)}</p><p class="date" style="margin-top:6px">${i.masthead.estimated_reading_minutes} minute read · ${i.front_page.length + i.sections.reduce((n, s) => n + s.stories.length, 0)} stories</p></div></li>`).join("")}
${issues.length ? "" : `<li><div class="date">No issues yet</div><div><p>Run the newsroom to publish the first issue.</p></div></li>`}
</ul>
</section>
<footer class="colophon">${esc(cfg.publisher)}</footer>
</div>
</body>
</html>`;
}
