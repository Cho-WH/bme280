import { graphColumns, DEFAULT_GRAPH } from '../data/contracts.js';
import { columnLabel } from '../analysis/calculations.js';
import { createAnalysisChart } from './chart-view.js';
import { createTrendControls } from './trend-controls.js';

export function createAnalysisGraph(root, { getWorkspace, getContext, act, onSelect, signal }) {
  const $ = id => root.querySelector('#' + id), x = $('graph-x'), y = $('graph-y'), type = $('graph-type'), gaps = $('graph-gaps');
  let chart = null, columnsKey = null, lastContext = null;
  const trend = createTrendControls(root, { getWorkspace, getContext, act, signal });
  function change() {
    if (getContext() === 'interpretation') return;
    if (x.value !== 'receivedAt') type.value = 'scatter';
    act(() => getWorkspace().setGraph({ xColumnId: x.value, yColumnId: y.value, type: type.value, connectGaps: gaps.checked }));
  }
  for (const input of [x, y, type, gaps]) input.addEventListener('change', change, { signal });
  $('graph-form').addEventListener('submit', event => event.preventDefault(), { signal });
  return {
    render(state, model, visible, canEdit, focusedId) {
      const context = getContext(), fixed = context === 'interpretation', current = fixed ? DEFAULT_GRAPH : state?.graph ?? DEFAULT_GRAPH;
      const columns = graphColumns(state?.calculatedColumns ?? [], getWorkspace()?.getImportedColumns() ?? []), key = JSON.stringify(columns);
      if (key !== columnsKey) {
        for (const select of [x, y]) select.replaceChildren(...columns.filter(c => select === x || c.id !== 'receivedAt').map(c => {
          const option = document.createElement('option'); option.value = c.id; option.textContent = columnLabel(c); return option;
        }));
        columnsKey = key;
      }
      x.value = current.xColumnId; y.value = current.yColumnId; type.value = current.type; gaps.checked = current.connectGaps;
      for (const input of [x, y, type, gaps]) input.disabled = !canEdit || fixed;
      $('graph-form').hidden = fixed; $('fixed-axes-badge').hidden = !fixed; $('graph-display-settings').hidden = fixed;
      $('graph-title').textContent = fixed ? '온도와 기압의 관계' : '두 물리량의 관계';
      $('graph-kicker').textContent = fixed ? 'INTERPRET YOUR EXPERIMENT' : 'EXPLORE THE RELATIONSHIP';
      type.querySelector('[value=line]').disabled = x.value !== 'receivedAt';
      $('graph-gap-control').hidden = x.value !== 'receivedAt' || type.value !== 'line';
      $('graph-empty').hidden = Boolean(model?.points.length || model?.excludedPoints.length);
      $('graph-empty').textContent = '현재 축에 표시할 유효한 자료가 없습니다.';
      $('graph-count').textContent = model ? '그래프 ' + model.points.length.toLocaleString() + '개' + (model.invalidCount ? ' · 현재 축의 값 없음 ' + model.invalidCount + '개' : '') : '';
      trend.render(model, canEdit);
      if (context !== lastContext) { $('trend-details').open = fixed; lastContext = context; }
      if (visible && model) {
        chart ??= createAnalysisChart($('analysis-chart'), { onSelect });
        chart.render(model, focusedId == null ? [] : [focusedId]);
        $('analysis-chart').setAttribute('aria-label', model.xLabel + ' 대 ' + model.yLabel + '. 그래프 ' + model.points.length + '개, 제외 ' + model.excludedCount + '개. 점의 정보는 표에서도 확인할 수 있습니다.');
      }
    },
    reset() { chart?.dispose(); chart = null; columnsKey = lastContext = null; },
    dispose() { chart?.dispose(); },
  };
}
