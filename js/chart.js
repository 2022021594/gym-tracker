/**
 * chart.js — 라이브러리 없이 SVG 꺾은선 그래프 문자열 만들기
 * @param {{label:string, value:number}[]} points
 * @param {{unit?:string}} opts
 */
export function lineChartSVG(points, { unit = 'kg' } = {}) {
  if (!points.length) return '';
  const W = 340, H = 210;
  const pad = { l: 44, r: 18, t: 22, b: 30 };
  const w = W - pad.l - pad.r;
  const h = H - pad.t - pad.b;
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) { min -= 5; max += 5; }
  if (min < 0 && Math.min(...vals) >= 0) min = 0;
  const x = (i) => (points.length === 1 ? pad.l + w / 2 : pad.l + (i * w) / (points.length - 1));
  const y = (v) => pad.t + ((max - v) / (max - min)) * h;
  const fmt = (v) => String(Math.round(v * 10) / 10);

  const grid = [max, (max + min) / 2, min].map((v) =>
    `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>` +
    `<text class="axis-label" x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`
  ).join('');

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const dots = points.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="4"/>`).join('');
  const lastI = points.length - 1;
  const lastLabel = `<text class="val" x="${x(lastI)}" y="${y(points[lastI].value) - 10}" text-anchor="${points.length === 1 ? 'middle' : 'end'}">${fmt(points[lastI].value)}${unit}</text>`;
  const xLabels =
    `<text class="axis-label" x="${x(0)}" y="${H - 8}" text-anchor="${points.length === 1 ? 'middle' : 'start'}">${points[0].label}</text>` +
    (points.length > 1 ? `<text class="axis-label" x="${x(lastI)}" y="${H - 8}" text-anchor="end">${points[lastI].label}</text>` : '');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="무게 변화 그래프">${grid}<path class="line" d="${path}"/>${dots}${lastLabel}${xLabels}</svg>`;
}
