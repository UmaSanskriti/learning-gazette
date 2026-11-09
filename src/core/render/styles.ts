/** Newspaper stylesheet. Cream and near-black with one crimson accent; serif headlines, sans support. */
export const ISSUE_CSS = `
:root {
  --surface: #f7f4ec; --surface-2: #efebe0; --ink: #141311; --ink-2: #4a4741; --ink-3: #7a766d; --rule: #d9d3c4;
  --accent: #8b1a2b; --chart-1: #b52e44; --series-2: #2a78d6; --series-3: #eb6834; --series-4: #1baf7a;
  --serif: "Newsreader", "Source Serif 4", Georgia, "Times New Roman", serif;
  --sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --measure: 68ch;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --surface: #171613; --surface-2: #211f1a; --ink: #f1ede2; --ink-2: #c9c3b4; --ink-3: #8f8a7c; --rule: #37342c;
  --accent: #e0788a; --chart-1: #d24f66; --series-2: #3987e5; --series-3: #d95926; --series-4: #199e70;
} }
:root[data-theme="dark"] {
  --surface: #171613; --surface-2: #211f1a; --ink: #f1ede2; --ink-2: #c9c3b4; --ink-3: #8f8a7c; --rule: #37342c;
  --accent: #e0788a; --chart-1: #d24f66; --series-2: #3987e5; --series-3: #d95926; --series-4: #199e70;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--surface); color: var(--ink); font-family: var(--serif); font-size: 18px; line-height: 1.55; }
a { color: inherit; text-decoration: underline; text-decoration-color: var(--rule); text-underline-offset: 3px; }
a:hover { text-decoration-color: var(--accent); }
.wrap { max-width: 1120px; margin: 0 auto; padding: 0 16px; }
.sample-banner { background: var(--accent); color: #fff; font-family: var(--sans); font-size: 14px; padding: 10px 16px; text-align: center; }
.masthead { text-align: center; padding: 40px 0 20px; border-bottom: 3px double var(--ink); }
.masthead h1 { font-family: var(--serif); font-weight: 500; font-size: clamp(40px, 7vw, 76px); letter-spacing: -0.01em; margin: 0; line-height: 1; }
.masthead .tagline { font-style: italic; color: var(--ink-2); margin: 10px 0 18px; font-size: 18px; }
.masthead .meta { font-family: var(--sans); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); display: flex; gap: 24px; justify-content: center; flex-wrap: wrap; }
nav.contents { font-family: var(--sans); font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; display: flex; flex-wrap: wrap; gap: 8px 20px; justify-content: center; padding: 14px 0; border-bottom: 1px solid var(--rule); margin-bottom: 36px; }
nav.contents a { text-decoration: none; color: var(--ink-2); }
nav.contents a:hover { color: var(--accent); }
section.sec { margin: 56px 0; }
.sec-head { display: flex; align-items: baseline; gap: 16px; border-top: 1px solid var(--ink); padding-top: 10px; margin-bottom: 28px; }
.sec-head h2 { font-family: var(--serif); font-weight: 500; font-size: 30px; margin: 0; }
.sec-head .sec-note { font-family: var(--sans); font-size: 13px; color: var(--ink-3); }
.kicker { font-family: var(--sans); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); margin: 0 0 8px; }
article.story { margin: 0 0 44px; }
article.story h3 { font-family: var(--serif); font-weight: 500; font-size: 28px; line-height: 1.15; margin: 0 0 10px; letter-spacing: -0.005em; }
article.lead h3 { font-size: clamp(34px, 5vw, 52px); line-height: 1.05; }
.deck { font-size: 20px; color: var(--ink-2); margin: 0 0 18px; font-style: italic; }
.lead .deck { font-size: 22px; }
.body p { margin: 0 0 1em; max-width: var(--measure); }
.labelled { border-left: 2px solid var(--accent); padding: 4px 0 4px 16px; margin: 20px 0; max-width: var(--measure); }
.labelled + .labelled { margin-top: 12px; }
.labelled .lbl { font-family: var(--sans); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); display: block; margin-bottom: 4px; }
.labelled p { margin: 0; }
.labelled.evidence { border-color: var(--ink-3); }
.labelled.evidence .lbl { color: var(--ink-3); }
.sources { font-family: var(--sans); font-size: 13px; color: var(--ink-2); margin: 16px 0 0; padding: 0; list-style: none; }
.sources li { margin: 3px 0; }
.sources .src-kind { color: var(--ink-3); }
.meta-row { font-family: var(--sans); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3); margin-top: 10px; display: flex; gap: 14px; flex-wrap: wrap; }
.front-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 40px; }
.front-grid article.story h3 { font-size: 24px; }
@media (max-width: 760px) { .front-grid { grid-template-columns: 1fr; } }
.lead-layout { display: grid; grid-template-columns: 3fr 2fr; gap: 40px; align-items: start; margin-bottom: 40px; padding-bottom: 32px; border-bottom: 1px solid var(--rule); }
@media (max-width: 900px) { .lead-layout { grid-template-columns: 1fr; } }
table.brief, table.compare, table.opps, .viz-table table { width: 100%; border-collapse: collapse; font-family: var(--sans); font-size: 14px; }
table.brief th, table.compare th, table.opps th, .viz-table th { text-align: left; font-weight: 600; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); padding: 8px 10px 8px 0; border-bottom: 1px solid var(--ink); }
table.brief td, table.compare td, table.opps td, .viz-table td { vertical-align: top; padding: 10px 10px 10px 0; border-bottom: 1px solid var(--rule); }
table.brief td:first-child { font-family: var(--serif); font-size: 16px; font-weight: 500; width: 22%; }
table.compare th[scope=row] { font-family: var(--serif); font-size: 15px; text-transform: none; letter-spacing: 0; color: var(--ink); }
.companies { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 28px 40px; }
.company h4 { font-family: var(--serif); font-size: 20px; font-weight: 500; margin: 0 0 6px; }
.company.quiet h4 { color: var(--ink-3); }
.company .quiet-note { font-family: var(--sans); font-size: 13px; color: var(--ink-3); }
.company p { margin: 0 0 8px; font-size: 16px; }
.company .lbl { font-family: var(--sans); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); display: block; }
.signal { background: var(--surface-2); padding: 20px 24px; margin-top: 32px; max-width: var(--measure); }
.signal .lbl { font-family: var(--sans); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); display: block; margin-bottom: 6px; }
.paper { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 32px; font-size: 16px; max-width: 900px; }
.paper .lbl { font-family: var(--sans); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); display: block; }
.paper > div { margin-bottom: 12px; }
.paper .wide { grid-column: 1 / -1; }
@media (max-width: 700px) { .paper { grid-template-columns: 1fr; } }
.concept h3 { font-family: var(--serif); font-size: 30px; font-weight: 500; margin: 0 0 16px; }
.concept .item { margin-bottom: 14px; max-width: var(--measure); }
.concept .lbl { font-family: var(--sans); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-3); display: block; }
.builder { display: grid; grid-template-columns: 1fr 1fr; gap: 24px 40px; }
@media (max-width: 760px) { .builder { grid-template-columns: 1fr; } }
.builder h4 { font-family: var(--sans); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); margin: 0 0 8px; }
.builder ol, .builder ul { margin: 0; padding-left: 20px; font-size: 16px; }
.builder li { margin-bottom: 8px; }
.builder .grounding { font-family: var(--sans); font-size: 12px; color: var(--ink-3); }
dl.glossary { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px 36px; margin: 0; }
dl.glossary dt { font-family: var(--serif); font-weight: 500; font-size: 19px; }
dl.glossary dd { margin: 4px 0 0; font-size: 15px; color: var(--ink-2); }
dl.glossary dd .why { display: block; font-family: var(--sans); font-size: 12px; color: var(--ink-3); margin-top: 4px; }
.editorial { max-width: 760px; margin: 0 auto; }
.editorial h3 { font-family: var(--serif); font-weight: 500; font-size: clamp(30px, 4.5vw, 44px); line-height: 1.1; margin: 0 0 12px; text-align: center; }
.editorial .deck { text-align: center; }
.editorial .body p { max-width: none; font-size: 19px; }
.editorial .body p:first-of-type::first-letter { font-size: 3.2em; float: left; line-height: 0.85; padding: 6px 8px 0 0; font-weight: 500; }
.question { border-top: 1px solid var(--ink); border-bottom: 1px solid var(--ink); padding: 18px 0; margin: 28px 0; font-size: 22px; font-style: italic; text-align: center; }
details.qa { font-family: var(--sans); font-size: 14px; color: var(--ink-2); margin-top: 24px; }
details.qa summary { cursor: pointer; text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; color: var(--ink-3); }
details.qa li { margin: 4px 0; }
details.qa .fail { color: var(--accent); }
footer.colophon { border-top: 3px double var(--ink); margin-top: 64px; padding: 24px 0 48px; font-family: var(--sans); font-size: 12px; color: var(--ink-3); text-align: center; line-height: 1.7; }
/* visuals */
.viz { margin: 26px 0 30px; padding: 18px 0 12px; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); max-width: 640px; font-family: var(--sans); }
.viz-head { display: block; margin-bottom: 12px; }
.viz-kicker { display: block; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 4px; }
.viz-head strong { display: block; font-family: var(--serif); font-weight: 500; font-size: 20px; line-height: 1.25; color: var(--ink); }
.viz-what { display: block; font-size: 13px; color: var(--ink-2); margin-top: 4px; }
.viz svg.chart { width: 100%; height: auto; display: block; font-family: var(--sans); }
.chart .grid { stroke: var(--rule); stroke-width: 1; }
.chart .axis { stroke: var(--ink-3); stroke-width: 1; }
.chart .tick, .chart .ylabel { font-size: 11px; fill: var(--ink-3); font-variant-numeric: tabular-nums; }
.chart .ylabel { fill: var(--ink-2); font-size: 12px; }
.chart .dlabel { font-size: 12px; fill: var(--ink); font-weight: 600; }
.chart [data-tip] { cursor: default; }
.chart [data-tip]:hover { opacity: 0.85; }
.viz-legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--ink-2); margin-bottom: 8px; }
.viz-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.viz-unit { font-size: 11px; color: var(--ink-3); margin-top: 4px; }
.viz-source { font-size: 12px; color: var(--ink-3); margin-top: 10px; }
.viz-table { font-size: 13px; margin-top: 8px; }
.viz-table summary { cursor: pointer; color: var(--ink-3); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
.viz-table td { font-variant-numeric: tabular-nums; }
.viz-tip { position: fixed; pointer-events: none; background: var(--ink); color: var(--surface); font-family: var(--sans); font-size: 12px; padding: 6px 9px; border-radius: 3px; z-index: 10; display: none; white-space: nowrap; }
.keynum { padding: 8px 0 4px; }
.keynum-value { font-family: var(--sans); font-weight: 600; font-size: 64px; line-height: 1; letter-spacing: -0.02em; color: var(--ink); }
.keynum-context { font-family: var(--serif); font-size: 17px; color: var(--ink-2); margin-top: 8px; max-width: 46ch; }
ol.timeline { list-style: none; margin: 0; padding: 0 0 0 18px; border-left: 2px solid var(--rule); }
ol.timeline li { position: relative; padding: 0 0 18px 16px; }
ol.timeline li::before { content: ""; position: absolute; left: -24px; top: 6px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); border: 2px solid var(--surface); }
.tl-date { display: block; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
.tl-label { display: block; font-family: var(--serif); font-size: 18px; font-weight: 500; color: var(--ink); }
.tl-detail { display: block; font-size: 14px; color: var(--ink-2); }
ol.flow { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; counter-reset: step; }
ol.flow li { flex: 1 1 140px; min-width: 140px; background: var(--surface-2); padding: 12px 14px 12px 14px; position: relative; border-radius: 2px; outline: none; transition: background .15s; }
ol.flow li:hover, ol.flow li:focus, ol.flow li.active { background: var(--ink); color: var(--surface); }
ol.flow li:hover .flow-detail, ol.flow li:focus .flow-detail, ol.flow li.active .flow-detail { color: var(--surface); opacity: .85; }
.flow-n { display: block; font-size: 11px; letter-spacing: 0.1em; color: var(--accent); margin-bottom: 4px; }
ol.flow li:hover .flow-n, ol.flow li.active .flow-n { color: var(--surface); }
.flow-title { display: block; font-family: var(--serif); font-size: 17px; font-weight: 500; }
.flow-detail { display: block; font-size: 13px; color: var(--ink-2); margin-top: 4px; }
blockquote.pull { margin: 0; padding: 4px 0 0 0; font-family: var(--serif); font-size: 26px; line-height: 1.3; font-weight: 500; }
blockquote.pull p { margin: 0 0 10px; }
blockquote.pull cite { font-family: var(--sans); font-style: normal; font-size: 13px; color: var(--ink-3); }
table.opps td:first-child { font-family: var(--serif); font-size: 16px; }
table.opps .kind { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); display: block; }
@media (max-width: 700px) { table.opps thead { display: none; } table.opps tr { display: block; padding: 10px 0; border-bottom: 1px solid var(--rule); } table.opps td { display: block; border: 0; padding: 2px 0; } }
/* archive */
.archive-list { list-style: none; padding: 0; margin: 0; }
.archive-list li { border-bottom: 1px solid var(--rule); padding: 22px 0; display: grid; grid-template-columns: 160px 1fr; gap: 20px; }
.archive-list .date { font-family: var(--sans); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); }
.archive-list h3 { font-family: var(--serif); font-weight: 500; font-size: 26px; margin: 0 0 6px; }
.archive-list p { margin: 0; color: var(--ink-2); }
@media (max-width: 600px) { .archive-list li { grid-template-columns: 1fr; gap: 6px; } }
`;

export const ISSUE_JS = `
(function(){
  var tip=document.createElement('div');tip.className='viz-tip';document.body.appendChild(tip);
  function show(e){var t=e.target.closest('[data-tip]');if(!t){tip.style.display='none';return;}tip.textContent=t.getAttribute('data-tip');tip.style.display='block';tip.style.left=(e.clientX+12)+'px';tip.style.top=(e.clientY-28)+'px';}
  document.addEventListener('mousemove',show);document.addEventListener('mouseleave',function(){tip.style.display='none';});
  document.querySelectorAll('ol.flow li').forEach(function(li){li.addEventListener('click',function(){li.parentNode.querySelectorAll('li').forEach(function(x){x.classList.remove('active');});li.classList.add('active');});});
})();
`;
