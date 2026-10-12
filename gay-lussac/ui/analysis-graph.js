import { graphColumns } from '../data/contracts.js';
import { columnLabel } from '../analysis/calculations.js';
import { createAnalysisChart } from './chart-view.js';
import { createTrendControls } from './trend-controls.js';

// Axis inputs are a draft until Apply; saved definitions and points come from Workspace.
export function createAnalysisGraph(root, { getWorkspace, act, onSelect, signal }) {
  const $ = id => root.querySelector('#' + id), form = $('graph-form');
  const x = $('graph-x'), y = $('graph-y'), type = $('graph-type'), gaps = $('graph-gaps');
  let chart = null, columnsKey = null, savedKey = null, current = null;
  const trend = createTrendControls(root, { getWorkspace, act, signal });
  function options() {
    const time = x.value === 'receivedAt';
    type.querySelector('[value=line]').disabled = !time;
    if (!time) type.value = 'scatter';
    $('graph-gap-control').hidden = !time || type.value !== 'line';
    $('graph-apply').disabled = !getWorkspace()?.isWritable() || (current && current.xColumnId === x.value
      && current.yColumnId === y.value && current.type === type.value && current.connectGaps === gaps.checked);
  }
  form.addEventListener('change', options, { signal });
  form.addEventListener('submit', event => {
    event.preventDefault();
    act(() => getWorkspace().setGraph({ xColumnId: x.value, yColumnId: y.value, type: type.value, connectGaps: gaps.checked }));
  }, { signal });
  return {
    render(state, model, visible, canEdit) {
      current = state?.graph ?? null;
      const columns = graphColumns(state?.calculatedColumns ?? [], getWorkspace()?.getImportedColumns() ?? []), key = JSON.stringify(columns);
      if (key !== columnsKey) {
        for (const [select, fallback] of [[x, 'temperatureC'], [y, 'pressureHpa']]) {
          const value = select.value;
          select.replaceChildren(...columns.filter(c => select === x || c.id !== 'receivedAt').map(c => {
            const option = document.createElement('option'); option.value = c.id; option.textContent = columnLabel(c); return option;
          }));
          select.value = columns.some(c => c.id === value) ? value : fallback;
        }
        columnsKey = key;
      }
      const graphKey = JSON.stringify(current && [current.xColumnId, current.yColumnId, current.type, current.connectGaps]);
      if (graphKey !== savedKey) {
        x.value = current?.xColumnId ?? 'temperatureC'; y.value = current?.yColumnId ?? 'pressureHpa';
        type.value = current?.type ?? 'scatter'; gaps.checked = current?.connectGaps ?? false;
        savedKey = graphKey;
      }
      for (const input of [x, y, type, gaps]) input.disabled = !canEdit;
      $('graph-apply').textContent = current ? '적용' : '그래프 만들기'; options();
      $('graph-empty').hidden = Boolean(model?.points.length || model?.excludedPoints.length);
      $('graph-empty').textContent = !model ? 'X축과 Y축을 선택하고 그래프를 만드세요.' : '선택한 축에 표시할 유효한 자료가 없습니다.';
      $('graph-plot').hidden = !model || !visible;
      $('graph-count').textContent = model ? `사용 ${model.points.length}개 · 제외 ${model.excludedPoints.length}개` + (model.invalidCount ? ` · 값 없음 ${model.invalidCount}개` : '') : '';
      $('graph-legend').hidden = !model;
      trend.render(model, canEdit);
      if (visible && model) {
        chart ??= createAnalysisChart($('analysis-chart'), { onSelect });
        chart.render(model, state.selectedIds);
        $('analysis-chart').setAttribute('aria-label', `${model.xLabel} 대 ${model.yLabel}. 사용 ${model.points.length}개, 제외 ${model.excludedPoints.length}개. ${model.regression?.enabled ? '추세선 표시 켜짐. ' : ''}자료 선택은 표에서도 할 수 있습니다.`);
      }
    },
    reset() { chart?.dispose(); chart = null; columnsKey = savedKey = null; },
    dispose() { chart?.dispose(); },
  };
}
