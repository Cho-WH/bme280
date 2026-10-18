import { clockTime, formatClockTime, formatElapsedTime } from '../analysis/clock-time.js';
import { formatCalculated } from '../analysis/calculations.js';
import { trendSummary } from './trend-summary.js';

// Keep axis lettering at its original size; only the plot bitmap stretches.
function captureLayoutPreview(chart) {
  const { canvas, chartArea: area, width, height } = chart;
  const layer = document.createElement('div'), pieces = [];
  layer.className = 'chart-layout-preview'; layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none';
  const ratioX = canvas.width / width, ratioY = canvas.height / height;
  function piece(x, y, w, h, transform) {
    if (w <= 0 || h <= 0) return;
    const image = document.createElement('canvas');
    image.width = Math.ceil(w * ratioX); image.height = Math.ceil(h * ratioY);
    image.getContext('2d').drawImage(canvas, x * ratioX, y * ratioY, w * ratioX, h * ratioY, 0, 0, image.width, image.height);
    image.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform-origin:0 0;will-change:transform`;
    layer.append(image); pieces.push({ image, transform });
  }
  const plotWidth = area.right - area.left, plotBottom = Math.ceil(area.bottom + 1);
  piece(0, 0, area.left, plotBottom, () => 'none');
  piece(area.left, 0, plotWidth, plotBottom, delta => `scaleX(${Math.max(0, plotWidth + delta) / plotWidth})`);
  const title = chart.options.scales.x.title;
  const titleHeight = title.display ? globalThis.Chart.helpers.toFont(title.font).lineHeight
    + globalThis.Chart.helpers.toPadding(title.padding).height : 0;
  const titleTop = Math.max(plotBottom, height - titleHeight);
  const ticks = chart.scales.x.ticks.map((_, index) => chart.scales.x.getPixelForTick(index));
  for (const [index, x] of ticks.entries()) {
    const left = index ? (ticks[index - 1] + x) / 2 : 0;
    const right = index + 1 < ticks.length ? (x + ticks[index + 1]) / 2 : width;
    piece(left, plotBottom, right - left, titleTop - plotBottom,
      delta => `translateX(${(x - area.left) / plotWidth * delta}px)`);
  }
  piece(0, titleTop, width, height - titleTop, delta => `translateX(${delta / 2}px)`);
  canvas.parentElement.append(layer);
  return {
    resize(nextWidth) { for (const { image, transform } of pieces) image.style.transform = transform(nextWidth - width); },
    remove() { layer.remove(); },
  };
}

export function createAnalysisChart(canvas, { onSelect = () => {}, responsive = true } = {}) {
  if (!globalThis.Chart) throw new Error('그래프 도구를 불러오지 못했어요. 화면을 새로 열어 주세요.');
  let model = null, preview = null, pendingRender = null;
  const clock = value => formatClockTime(clockTime(value));
  const chart = new globalThis.Chart(canvas, {
    type: 'scatter', data: { datasets: [] },
    options: {
      responsive: false, maintainAspectRatio: false, animation: false, parsing: false,
      ...(responsive ? {} : { devicePixelRatio: 1 }),
      interaction: { mode: 'nearest', intersect: true },
      elements: { point: { radius: 3, hitRadius: 7 }, line: { borderWidth: 1.5 } },
      onClick(event, elements) {
        const hit = elements.find(e => chart.data.datasets[e.datasetIndex].data[e.index]?.sampleId);
        onSelect(hit ? chart.data.datasets[hit.datasetIndex].data[hit.index].sampleId : null);
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
  // During a layout transition only the captured bitmap is transformed. Keep
  // the expensive point layout and canvas redraw for the final size.
  function resize() {
    if (!responsive) return false;
    const { clientWidth: width, clientHeight: height } = canvas.parentElement;
    if (preview) {
      preview.resize(width);
      return false;
    }
    if (width <= 0 || height <= 0 || getComputedStyle(canvas).visibility === 'hidden') return false;
    if (chart.width === width && chart.height === height && chart.currentDevicePixelRatio === window.devicePixelRatio) return false;
    chart.resize(width, height);
    return true;
  }
  function clearPreview() {
    preview?.remove(); preview = null;
    canvas.style.removeProperty('opacity'); canvas.style.removeProperty('pointer-events');
  }
  const observer = responsive ? new ResizeObserver(resize) : null;
  observer?.observe(canvas.parentElement);
  if (responsive) window.addEventListener('resize', resize);
  const view = {
    beginLayoutTransition() {
      if (!responsive || !model || chart.width <= 0 || chart.height <= 0 || !(chart.chartArea?.right > chart.chartArea?.left)) return;
      if (preview) return; // Rapid reversals continue from the current transform.
      chart.setActiveElements([]);
      chart.tooltip?.setActiveElements([], { x: 0, y: 0 });
      chart.draw();
      preview = captureLayoutPreview(chart);
      canvas.style.opacity = '0'; canvas.style.pointerEvents = 'none';
      resize();
    },
    endLayoutTransition() {
      if (!preview) return;
      // Reveal only after the final canvas has been drawn in this same task.
      const snapshot = preview; preview = null;
      const pending = pendingRender; pendingRender = null;
      try {
        if (pending) view.render(...pending); else resize();
      } finally { snapshot.remove(); clearPreview(); }
    },
    render(next, selectedIds = []) {
      if (preview) { pendingRender = [next, selectedIds]; return; }
      model = next;
      const selected = new Set(selectedIds), color = c => selected.has(c.raw?.sampleId) ? '#d67b40' : '#197f88';
      chart.data.datasets = [
        { label: '분석 포함', data: model.type === 'line' ? model.line : model.points, showLine: model.type === 'line', spanGaps: false,
          borderColor: '#197f88', pointBackgroundColor: color, pointBorderColor: color,
          pointRadius: c => selected.has(c.raw?.sampleId) ? 5 : 3 },
        { label: '제외', data: model.excludedPoints, pointStyle: 'circle', pointRadius: 4, pointBorderWidth: 1.5,
          pointBackgroundColor: '#ffffffcc', pointBorderColor: c => selected.has(c.raw?.sampleId) ? '#d67b40' : '#aebbbb' },
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
      if (!resize()) chart.update('none');
    },
    dispose() { observer?.disconnect(); window.removeEventListener('resize', resize); clearPreview(); pendingRender = null; chart.destroy(); },
  };
  return view;
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
    ctx.fillText(`분석 포함 ${model.includedCount ?? model.points.length}개 · 제외 ${model.excludedCount ?? model.excludedPoints.length}개 · 그래프 ${model.points.length}개${model.invalidCount ? ` · 값 없음 ${model.invalidCount}개` : ''} · ${model.view === 'extended' ? '추세선 연장' : '측정 범위'}   ● 분석 포함   ○ 제외`, 24, plotTop - 28);
    ctx.drawImage(plot, 0, plotTop); ctx.font = `17px ${font}`;
    caption.forEach((text, i) => ctx.fillText(text, 24, plotTop + 648 + i * 26));
    return output.toDataURL('image/png');
  } finally { view.dispose(); }
}

export function createChartView(canvas, { inspect = false, onCursor = () => {}, onLayout = () => {} } = {}) {
  if (!globalThis.Chart) throw new Error('그래프 도구를 불러오지 못했어요. 화면을 새로 열어 주세요.');
  let currentPoints = [], timeOrigin = 0, cursor = null;
  const chart = new globalThis.Chart(canvas, {
    type: 'line',
    plugins: inspect ? [{ id: 'shared-time-cursor',
      afterEvent(c, { event, inChartArea }) {
        if (event.type === 'mouseout' || !inChartArea) { cursor = null; onCursor(null); c.draw(); return; }
        if (!currentPoints.length) return;
        const at = c.scales.x.getValueForPixel(event.x) * 1000 + timeOrigin;
        const point = currentPoints.reduce((best, p) => Math.abs(p.receivedAt - at) < Math.abs(best.receivedAt - at) ? p : best);
        cursor = (point.receivedAt - timeOrigin) / 1000; onCursor(point, cursor); c.draw();
      },
      afterDraw(c) {
        if (cursor !== null && c.chartArea) {
          const x = c.scales.x.getPixelForValue(cursor), { top, bottom } = c.chartArea, ctx = c.ctx;
          ctx.save(); ctx.strokeStyle = '#718b94'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke(); ctx.restore();
        }
        onLayout();
      },
    }] : [],
    data: { datasets: [
      { label: '온도 (℃)', yAxisID: 'temperature', borderColor: '#d67b40', backgroundColor: '#d67b40', data: [] },
      { label: inspect ? '기압 (hPa)' : '압력 (hPa)', yAxisID: 'pressure', borderColor: '#197f88', backgroundColor: '#197f88', data: [] },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      parsing: false, spanGaps: false,
      elements: { point: { radius: 0, hitRadius: 8 }, line: { borderWidth: 2 } },
      plugins: { tooltip: { enabled: !inspect, callbacks: {
        title: items => formatElapsedTime(items[0]?.raw.elapsedSeconds),
      } }, legend: { display: !inspect, position: 'bottom', labels: { usePointStyle: true, boxWidth: 7, font: { size: 13 } } } },
      scales: {
        x: { type: 'linear', min: -60, max: 0, title: { display: true, text: '지금으로부터 (초)' }, grid: { color: '#edf1f2' } },
        temperature: { type: 'linear', position: 'left', title: { display: true, text: '온도 (℃)' }, grid: { color: '#edf1f2' } },
        pressure: { type: 'linear', position: 'right', title: { display: true, text: inspect ? '기압 (hPa)' : '압력 (hPa)', color: '#197f88' }, grid: { drawOnChartArea: false } },
      },
    },
  });
  return {
    render(model) {
      currentPoints = model.points; timeOrigin = model.origin;
      chart.options.scales.x.min = model.whole ? undefined : -60;
      chart.options.scales.x.max = model.whole ? undefined : 0;
      chart.options.scales.x.title.text = model.whole ? '첫 수신으로부터 (초)' : '지금으로부터 (초)';
      model.series.forEach((data, index) => { chart.data.datasets[index].data = data; });
      chart.data.datasets[2] = { type: 'scatter', label: '조작 기록', yAxisID: 'temperature',
        pointStyle: 'triangle', pointRadius: 6, backgroundColor: '#87632f', data: model.markers };
      chart.update('none');
    },
    resize() { chart.resize(); },
    timeGeometry() {
      if (!chart.chartArea || !chart.scales?.x) return null;
      const { left, top, right, bottom } = chart.chartArea;
      return { left, top, width: right - left, height: bottom - top,
        pixel: time => chart.scales.x.getPixelForValue((time - timeOrigin) / 1000),
        time: pixel => chart.scales.x.getValueForPixel(pixel) * 1000 + timeOrigin };
    },
    exportPng() { return chart.toBase64Image(); },
    dispose() { chart.destroy(); },
  };
}
