import type { Visual } from "../schema.ts";

/**
 * Inline-SVG and HTML renderers for the Visual spec. Follows the data-viz
 * conventions used in this repo: thin marks (bars <= 24px, 2px lines, 4px
 * rounded data ends), hairline solid gridlines, a surface gap between touching
 * marks, selective direct labels, a legend for two or more series, and a table
 * twin for every chart so no value is reachable only by hover.
 */

/** Validated with the data-viz palette checker: crimson step, then blue, orange, aqua (see README). */
const SERIES = ["var(--chart-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];

export const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderVisual(v: Visual): string {
  let inner = "";
  switch (v.visual_type) {
    case "bar": inner = columnChart(v); break;
    case "horizontal_bar": inner = barChart(v); break;
    case "line": inner = lineChart(v); break;
    case "key_number": inner = keyNumber(v); break;
    case "timeline": inner = timeline(v); break;
    case "process_flow": inner = processFlow(v); break;
    case "comparison_table": inner = comparisonTable(v); break;
    case "pull_quote": inner = pullQuote(v); break;
  }
  if (!inner) return "";
  const src = v.source_url ? `<a href="${esc(v.source_url)}" rel="noopener">${esc(v.source)}</a>` : esc(v.source);
  const isChart = ["bar", "horizontal_bar", "line"].includes(v.visual_type);
  return `<figure class="viz viz-${v.visual_type}">
  <figcaption class="viz-head"><span class="viz-kicker">${esc(labelFor(v.visual_type))}</span><strong>${esc(v.headline)}</strong>${v.what_it_shows ? `<span class="viz-what">${esc(v.what_it_shows)}</span>` : ""}</figcaption>
  ${inner}
  ${isChart ? tableTwin(v) : ""}
  <div class="viz-source">Source: ${src}</div>
</figure>`;
}

function labelFor(t: Visual["visual_type"]): string {
  return { bar: "Chart", horizontal_bar: "Chart", line: "Chart", key_number: "Key number", timeline: "Timeline", process_flow: "How it works", comparison_table: "Comparison", pull_quote: "In their words" }[t];
}

function seriesOf(v: Visual): string[] {
  return [...new Set(v.data_points.map((d) => d.series || "value"))].slice(0, 4);
}

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const ticks: number[] = [];
  for (let t = 0; t <= max + step * 0.999; t += step) ticks.push(+t.toFixed(6));
  return ticks;
}

const fmt = (n: number) => (Math.abs(n) >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));

function legend(series: string[]): string {
  if (series.length < 2) return "";
  return `<div class="viz-legend">${series.map((s, i) => `<span><i style="background:${SERIES[i]}"></i>${esc(s)}</span>`).join("")}</div>`;
}

function columnChart(v: Visual): string {
  const series = seriesOf(v);
  const labels = [...new Set(v.data_points.map((d) => d.label))].slice(0, 8);
  if (!labels.length) return "";
  const W = 600, H = 300, m = { t: 16, r: 16, b: 48, l: 44 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const max = Math.max(...v.data_points.map((d) => d.value), 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const y = (val: number) => m.t + ph - (val / top) * ph;
  const band = pw / labels.length;
  const barW = Math.min(24, (band * 0.7) / series.length - 2);
  const groupW = series.length * barW + (series.length - 1) * 2;
  let out = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(v.alt_text)}" class="chart">`;
  for (const t of ticks) out += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end" class="tick">${fmt(t)}</text>`;
  labels.forEach((lab, i) => {
    const x0 = m.l + band * i + (band - groupW) / 2;
    series.forEach((s, j) => {
      const d = v.data_points.find((p) => p.label === lab && (p.series || "value") === s);
      if (!d) return;
      const x = x0 + j * (barW + 2);
      const h = Math.max(0, y(0) - y(d.value));
      const r = Math.min(4, h / 2);
      out += `<path d="M${x},${y(0)} v${-(h - r)} a${r},${r} 0 0 1 ${r},${-r} h${barW - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} z" fill="${SERIES[j]}" data-tip="${esc(lab)}${series.length > 1 ? " · " + esc(s) : ""}: ${fmt(d.value)}${v.unit ? " " + esc(v.unit) : ""}"/>`;
      if (series.length === 1 && (d.value === max)) out += `<text x="${x + barW / 2}" y="${y(d.value) - 6}" text-anchor="middle" class="dlabel">${fmt(d.value)}${v.unit === "%" ? "%" : ""}</text>`;
    });
    out += `<text x="${m.l + band * i + band / 2}" y="${H - m.b + 18}" text-anchor="middle" class="tick">${esc(truncate(lab, 14))}</text>`;
  });
  out += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" class="axis"/></svg>`;
  return legend(series) + out + (v.unit ? `<div class="viz-unit">${esc(v.unit)}</div>` : "");
}

function barChart(v: Visual): string {
  const series = seriesOf(v);
  const labels = [...new Set(v.data_points.map((d) => d.label))].slice(0, 8);
  if (!labels.length) return "";
  const W = 600, rowH = series.length * 26 + 14, m = { t: 8, r: 64, b: 8, l: 150 };
  const H = m.t + m.b + rowH * labels.length;
  const pw = W - m.l - m.r;
  const max = Math.max(...v.data_points.map((d) => d.value), 0);
  const top = niceTicks(max).pop()!;
  const x = (val: number) => m.l + (val / top) * pw;
  let out = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(v.alt_text)}" class="chart">`;
  labels.forEach((lab, i) => {
    const y0 = m.t + rowH * i + 7;
    out += `<text x="${m.l - 10}" y="${y0 + (rowH - 14) / 2 + 4}" text-anchor="end" class="ylabel">${esc(truncate(lab, 22))}</text>`;
    series.forEach((s, j) => {
      const d = v.data_points.find((p) => p.label === lab && (p.series || "value") === s);
      if (!d) return;
      const y = y0 + j * 26;
      const w = Math.max(0, x(d.value) - m.l);
      const r = Math.min(4, w / 2);
      out += `<path d="M${m.l},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${24 - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - r)} z" fill="${SERIES[j]}" data-tip="${esc(lab)}${series.length > 1 ? " · " + esc(s) : ""}: ${fmt(d.value)}${v.unit ? " " + esc(v.unit) : ""}"/>`;
      out += `<text x="${x(d.value) + 8}" y="${y + 16}" class="dlabel">${fmt(d.value)}</text>`;
    });
  });
  out += `<line x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${H - m.b}" class="axis"/></svg>`;
  return legend(series) + out + (v.unit ? `<div class="viz-unit">${esc(v.unit)}</div>` : "");
}

function lineChart(v: Visual): string {
  const series = seriesOf(v);
  const labels = [...new Set(v.data_points.map((d) => d.label))].slice(0, 12);
  if (labels.length < 2) return columnChart(v);
  const W = 600, H = 300, m = { t: 16, r: 90, b: 40, l: 44 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const values = v.data_points.map((d) => d.value);
  const max = Math.max(...values, 0);
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const y = (val: number) => m.t + ph - (val / top) * ph;
  const x = (i: number) => m.l + (i / (labels.length - 1)) * pw;
  let out = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(v.alt_text)}" class="chart">`;
  for (const t of ticks) out += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end" class="tick">${fmt(t)}</text>`;
  labels.forEach((lab, i) => {
    if (labels.length <= 8 || i % 2 === 0) out += `<text x="${x(i)}" y="${H - m.b + 18}" text-anchor="middle" class="tick">${esc(truncate(lab, 10))}</text>`;
  });
  series.forEach((s, j) => {
    const pts = labels.map((lab, i) => {
      const d = v.data_points.find((p) => p.label === lab && (p.series || "value") === s);
      return d ? { i, v: d.value } : null;
    }).filter((p): p is { i: number; v: number } => !!p);
    if (!pts.length) return;
    out += `<path d="${pts.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.v)}`).join(" ")}" fill="none" stroke="${SERIES[j]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    for (const p of pts) out += `<circle cx="${x(p.i)}" cy="${y(p.v)}" r="5" fill="${SERIES[j]}" stroke="var(--surface)" stroke-width="2" data-tip="${esc(labels[p.i])}${series.length > 1 ? " · " + esc(s) : ""}: ${fmt(p.v)}${v.unit ? " " + esc(v.unit) : ""}"/>`;
    const last = pts[pts.length - 1];
    out += `<text x="${x(last.i) + 10}" y="${y(last.v) + 4}" class="dlabel">${series.length > 1 ? esc(truncate(s, 12)) + " " : ""}${fmt(last.v)}${v.unit === "%" ? "%" : ""}</text>`;
  });
  out += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" class="axis"/></svg>`;
  return legend(series) + out + (v.unit && v.unit !== "%" ? `<div class="viz-unit">${esc(v.unit)}</div>` : "");
}

function tableTwin(v: Visual): string {
  const series = seriesOf(v);
  const labels = [...new Set(v.data_points.map((d) => d.label))];
  const rows = labels.map((lab) => `<tr><th scope="row">${esc(lab)}</th>${series.map((s) => {
    const d = v.data_points.find((p) => p.label === lab && (p.series || "value") === s);
    return `<td>${d ? fmt(d.value) : ""}</td>`;
  }).join("")}</tr>`).join("");
  return `<details class="viz-table"><summary>Table view</summary><table><thead><tr><th></th>${series.map((s) => `<th>${esc(s)}${v.unit ? ` (${esc(v.unit)})` : ""}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></details>`;
}

function keyNumber(v: Visual): string {
  return `<div class="keynum" role="img" aria-label="${esc(v.alt_text)}"><div class="keynum-value">${esc(v.key_number)}</div><div class="keynum-context">${esc(v.key_number_context)}</div></div>`;
}

function timeline(v: Visual): string {
  if (!v.timeline.length) return "";
  return `<ol class="timeline" aria-label="${esc(v.alt_text)}">${v.timeline.slice(0, 8).map((t) => `<li><span class="tl-date">${esc(t.date)}</span><span class="tl-label">${esc(t.label)}</span><span class="tl-detail">${esc(t.detail)}</span></li>`).join("")}</ol>`;
}

function processFlow(v: Visual): string {
  if (!v.steps.length) return "";
  return `<ol class="flow" aria-label="${esc(v.alt_text)}">${v.steps.slice(0, 7).map((s, i) => `<li tabindex="0"><span class="flow-n">${i + 1}</span><span class="flow-title">${esc(s.title)}</span><span class="flow-detail">${esc(s.detail)}</span></li>`).join("")}</ol>`;
}

function comparisonTable(v: Visual): string {
  if (!v.columns.length || !v.rows.length) return "";
  return `<table class="compare" aria-label="${esc(v.alt_text)}"><thead><tr><th></th>${v.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${v.rows.map((r) => `<tr><th scope="row">${esc(r.dimension)}</th>${v.columns.map((_, i) => `<td>${esc(r.values[i] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function pullQuote(v: Visual): string {
  if (!v.quote) return "";
  return `<blockquote class="pull"><p>${esc(v.quote)}</p>${v.attribution ? `<cite>${esc(v.attribution)}</cite>` : ""}</blockquote>`;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
