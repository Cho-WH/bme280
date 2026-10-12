import { CONNECTION } from '../program-config.js';
import { clockTime, formatClockTime } from '../analysis/clock-time.js';
import { formatCalculated } from '../analysis/calculations.js';
import { trendSummary } from './trend-summary.js';

export function createAnalysisChart(canvas, { onSelect = () => {}, responsive = true } = {}) {
  if (!globalThis.Chart) throw new Error('그래프 도구를 불러오지 못했어요. 화면을 새로 열어 주세요.');
  let model = null;
  const clock = value => formatClockTime(clockTime(value));
  const chart = new globalThis.Chart(canvas, {
    type: 'scatter', data: { datasets: [] },
    options: {
      responsive, maintainAspectRatio: false, animation: false, parsing: false,
      ...(responsive ? {} : { devicePixelRatio: 1 }),
      interaction: { mode: 'nearest', intersect: true },
      elements: { point: { radius: 3, hitRadius: 7 }, line: { borderWidth: 1.5 } },
      onClick(event, elements) {
        const hit = elements.find(e => chart.data.datasets[e.datasetIndex].data[e.index]?.sampleId);
        if (hit) onSelect(chart.data.datasets[hit.datasetIndex].data[hit.index].sampleId);
      },
      plugins: {
        legend: { display: false },
        tooltip: { filter: item => Boolean(item.raw.sampleId) || item.dataset.isIntercept === true, callbacks: {
          title: items => items[0].dataset.isIntercept ? 'x절편' : '자료 ' + items[0].raw.sampleId,
          label: item => {
            const coordinates = [model.xLabel + ': ' + (model.xColumnId === 'receivedAt' ? clock(item.raw.x) : formatCalculated(item.raw.x)),
              model.yLabel + ': ' + formatCalculated(item.raw.y)];
            if (!item.dataset.isIntercept) return [item.dataset.label, ...coordinates];
            if (model.xColumnId === 'receivedAt') coordinates.push('경과 시간: ' + formatCalculated(model.regression.result.xIntercept) + '초');
            return coordinates;
          },
        } },
      },
      scales: {
        x: { type: 'linear', title: { display: true }, ticks: { maxTicksLimit: 6 }, grid: { color: '#edf1f2' } },
        y: { type: 'linear', title: { display: true }, grid: { color: '#edf1f2' } },
      },
    },
  });
  return {
    render(next, selectedIds) {
      model = next;
      const selected = new Set(selectedIds), color = c => selected.has(c.raw?.sampleId) ? '#d67b40' : '#197f88';
      chart.data.datasets = [
        { label: '사용', data: model.type === 'line' ? model.line : model.points, showLine: model.type === 'line', spanGaps: false,
          borderColor: '#197f88', pointBackgroundColor: color, pointBorderColor: color,
          pointRadius: c => selected.has(c.raw?.sampleId) ? 5 : 3 },
        { label: '제외', data: model.excludedPoints, pointStyle: 'crossRot', pointRadius: 5,
          pointBackgroundColor: '#9caaa9', pointBorderColor: c => selected.has(c.raw?.sampleId) ? '#d67b40' : '#9caaa9' },
      ];
      const line = (label, data, dashed = false) => ({ label, data, showLine: true, pointRadius: 0, pointHitRadius: 0,
        borderColor: '#9a5d30', borderWidth: 1.8, borderDash: dashed ? [6, 4] : [], order: 1 });
      if (model.trend?.measured.length) {
        chart.data.datasets.push(line('추세선', model.trend.measured), line('연장선', model.trend.extension, true));
        if (model.trend.intercept.length) chart.data.datasets.push({ label: 'x절편', isIntercept: true, data: model.trend.intercept,
          pointStyle: 'cross', pointRadius: 6, pointHitRadius: 7, pointBorderColor: '#9a5d30', pointBorderWidth: 2 });
      }
      chart.options.scales.x.title.text = model.xLabel;
      chart.options.scales.y.title.text = model.yLabel;
      chart.options.scales.x.ticks.callback = model.xColumnId === 'receivedAt' ? clock : value => formatCalculated(value);
      if (responsive) chart.resize();
      chart.update('none');
    },
    dispose() { chart.destroy(); },
  };
}

// Render from a captured display model, including when the visible chart is hidden.
// A separate fixed-size chart keeps download size independent of the window and view mode.
export function exportAnalysisPng(model, { name = '', selectedIds = [] } = {}) {
  if (!model) throw new Error('먼저 분석 그래프를 만드세요.');
  const plot = document.createElement('canvas'); plot.width = 1200; plot.height = 640;
  const view = createAnalysisChart(plot, { responsive: false });
  try {
    view.render(model, selectedIds);
    const output = document.createElement('canvas'), ctx = output.getContext('2d');
    const font = '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif';
    const summary = trendSummary(model);
    const wrap = (text, size, weight = '') => {
      ctx.font = `${weight} ${size}px ${font}`.trim();
      const lines = []; let line = '';
      for (const char of text) {
        if (line && ctx.measureText(line + char).width > 1152) { lines.push(line); line = ''; }
        line += char;
      }
      if (line) lines.push(line);
      return lines;
    };
    const title = wrap(name || '기체의 온도와 압력', 22, 'bold');
    const caption = [summary.equation, summary.detail].filter(Boolean).flatMap(t => wrap(t, 17));
    const plotTop = 24 + title.length * 30 + 36;
    output.width = 1200; output.height = plotTop + 640 + caption.length * 26 + 28;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, output.width, output.height);
    ctx.textBaseline = 'top'; ctx.fillStyle = '#263b40'; ctx.font = `bold 22px ${font}`;
    title.forEach((text, i) => ctx.fillText(text, 24, 20 + i * 30));
    ctx.font = `16px ${font}`;
    ctx.fillText(`사용 ${model.points.length}개 · 제외 ${model.excludedPoints.length}개${model.invalidCount ? ` · 값 없음 ${model.invalidCount}개` : ''} · ${model.view === 'extended' ? '직선 연장' : '측정 범위'}   ● 사용   × 제외${selectedIds.length ? '   주황색: 체크' : ''}`, 24, plotTop - 28);
    ctx.drawImage(plot, 0, plotTop); ctx.font = `17px ${font}`;
    caption.forEach((text, i) => ctx.fillText(text, 24, plotTop + 648 + i * 26));
    return output.toDataURL('image/png');
  } finally { view.dispose(); }
}

export function createChartView(canvas) {
  if (!globalThis.Chart) throw new Error('그래프 도구를 불러오지 못했어요. 화면을 새로 열어 주세요.');
  const chart = new globalThis.Chart(canvas, {
    type: 'line',
    data: { datasets: [
      { label: '온도 (℃)', yAxisID: 'temperature', borderColor: '#d67b40', backgroundColor: '#d67b40', data: [] },
      { label: '압력 (hPa)', yAxisID: 'pressure', borderColor: '#197f88', backgroundColor: '#197f88', data: [] },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      parsing: false, spanGaps: false,
      elements: { point: { radius: 0, hitRadius: 8 }, line: { borderWidth: 2 } },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7, font: { size: 13 } } } },
      scales: {
        x: { type: 'linear', min: -60, max: 0, title: { display: true, text: '지금으로부터 (초)' }, grid: { color: '#edf1f2' } },
        temperature: { type: 'linear', position: 'left', title: { display: true, text: '온도 (℃)' }, grid: { color: '#edf1f2' } },
        pressure: { type: 'linear', position: 'right', title: { display: true, text: '압력 (hPa)' }, grid: { drawOnChartArea: false } },
      },
    },
  });
  return {
    render(points, now, { range = 'recent', events = [], origin = points[0]?.receivedAt ?? now, connectGaps = false } = {}) {
      const whole = range === 'all';
      chart.options.scales.x.min = whole ? undefined : -60;
      chart.options.scales.x.max = whole ? undefined : 0;
      chart.options.scales.x.title.text = whole ? '첫 수신으로부터 (초)' : '지금으로부터 (초)';
      for (const [index, field] of ['temperatureC', 'pressureHpa'].entries()) {
        const data = [];
        let previous;
        for (const point of points) {
          const x = whole ? (point.receivedAt - origin) / 1000 : (point.monotonicAt - now) / 1000;
          const delta = previous ? point.receivedAt - previous.receivedAt : 0;
          if (previous && (delta < 0 || (!connectGaps && delta >= CONNECTION.staleMs))) data.push({ x, y: null });
          data.push({ x, y: point.validity[field] === 'valid' ? point[field] : null });
          previous = point;
        }
        chart.data.datasets[index].data = data;
      }
      // User actions share the time axis. Null points keep discontinuities visible.
      chart.data.datasets[2] = { type: 'scatter', label: '조작 기록', yAxisID: 'temperature',
        pointStyle: 'triangle', pointRadius: 6, backgroundColor: '#87632f',
        data: events.filter((e) => e.source === 'user').flatMap((e) => {
          const nearest = points.find((p) => p.receivedAt >= e.receivedAt && p.validity.temperatureC === 'valid');
          if (!nearest) return [];
          const x = whole ? (e.receivedAt - origin) / 1000
            : (nearest.monotonicAt - now - (nearest.receivedAt - e.receivedAt)) / 1000;
          return x < -60 && !whole ? [] : [{ x, y: nearest.temperatureC }];
        }) };
      chart.update('none');
    },
    resize() { chart.resize(); },
    exportPng() { return chart.toBase64Image(); },
    dispose() { chart.destroy(); },
  };
}
