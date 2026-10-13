import { createWorkspace } from '../analysis/workspace.js';
import { createColumnFilters } from './column-filters.js';
import { createDataTable } from './data-table.js';
import { createCalculationEditor } from './calculation-editor.js';
import { createAnalysisGraph } from './analysis-graph.js';
import { createRangeSelector } from './range-selector.js';
import { tableColumns } from './table-columns.js';
import { columnFilterActive } from '../analysis/table-data.js';
import { scopeMembership, statusLabels, timeBounds } from '../analysis/scope.js';
import { formatCalculated } from '../analysis/calculations.js';
import { exportAnalysisPng, createChartView } from './chart-view.js';

export function createAnalysisView(root, { onError, onExport = () => {} }) {
  const $ = id => root.querySelector('#' + id), events = new AbortController(), { signal } = events;
  let store = null, workspace = null, task = 'overview', tableOpen = false, allColumns = false, focusedId = null;
  let overview = null, overviewKey = null, range = null, toastRevision = null, toastTimer = null, currentModel = null;
  const number = value => value.toLocaleString('ko-KR');
  const context = () => task === 'interpretation' ? 'interpretation' : 'relationship';
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function animate(element, move = true) {
    if (reduced() || element.hidden) return;
    element.getAnimations().forEach(a => a.cancel());
    element.animate([{ opacity: .55, ...(move ? { transform: 'translateY(6px)' } : {}) }, { opacity: 1, ...(move ? { transform: 'translateY(0)' } : {}) }],
      { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }
  function dismissToast() { clearTimeout(toastTimer); toastRevision = null; $('analysis-toast').hidden = true; }
  function notify(text) {
    dismissToast(); toastRevision = workspace.getState().workspaceRevision;
    $('analysis-toast').querySelector('span').textContent = text; $('analysis-toast').hidden = false; animate($('analysis-toast'), false);
    toastTimer = setTimeout(dismissToast, 6500);
  }
  function act(action) {
    try {
      $('analysis-feedback').textContent = ''; action();
      if (toastRevision !== null && toastRevision !== workspace?.getState().workspaceRevision) dismissToast();
      render(); return true;
    } catch (error) { render(); $('analysis-feedback').textContent = error.message; return false; }
  }
  function inspect(id) {
    focusedId = id; $('point-reason').value = ''; render();
    if (tableOpen) table.reveal(id);
    animate($('point-inspector')); $('close-point').focus({ preventScroll: true });
  }
  const table = createDataTable({ body: $('raw-rows'), scroller: $('raw-scroll'), status: $('table-status'),
    onToggle(id, selected) { act(() => workspace.toggleSelection(id, selected)); },
    onSort(id) { act(() => workspace.setSort(id)); }, onInspect: inspect });
  const filters = createColumnFilters(root, { getWorkspace: () => workspace, act, signal });
  const calculations = createCalculationEditor(root, { getWorkspace: () => workspace,
    render({ revealColumnId } = {}) {
      allColumns = true; tableOpen = true; render();
      if (revealColumnId) {
        const header = [...root.querySelectorAll('[data-column]')].find(el => el.dataset.column === revealColumnId);
        if (header) $('raw-scroll').scrollLeft = header.offsetLeft - 32;
      }
    }, signal });
  const graph = createAnalysisGraph(root, { getWorkspace: () => workspace, getContext: context, act, signal, onSelect: inspect });
  range = createRangeSelector(root, { getChart: () => overview, signal,
    onApply(draft) { if (act(() => workspace.applyTimeRange(draft))) { range.close(); changeTask('relationship'); } },
    onClose() { $('choose-range').focus({ preventScroll: true }); } });
  function click(id, action) { $(id).addEventListener('click', action, { signal }); }
  function changeTask(next) {
    filters.close(); calculations.close(); focusedId = null; task = next; render();
    animate(next === 'overview' ? $('overview-pane') : $('analysis-graph-pane'));
  }
  for (const button of root.querySelectorAll('[data-analysis-task]'))
    button.addEventListener('click', () => changeTask(button.dataset.analysisTask), { signal });
  function openRange() {
    if (!workspace?.isWritable()) return;
    changeTask('overview'); range.open(workspace.getState()); animate($('range-form'));
  }
  click('choose-range', openRange); click('edit-analysis-range', openRange);
  click('use-all-data', () => { if (act(() => workspace.applyScope('all'))) { range.close(); changeTask('relationship'); } });
  click('apply-new-data', () => act(() => workspace.showNewData()));
  click('select-all', () => act(() => $('select-all').checked ? workspace.selectAll() : workspace.clearSelection()));
  click('clear-selection', () => act(() => workspace.clearSelection()));
  click('exclude-selection', () => {
    const ids = workspace.getState().selectedIds, count = ids.filter(id => !workspace.getState().exclusions.some(e => e.sampleId === id)).length;
    if (act(() => workspace.exclude(ids, $('exclusion-reason').value))) {
      $('exclusion-reason').value = ''; if (count) notify(number(count) + '개를 제외했어요');
    }
  });
  click('restore-selection', () => act(() => workspace.restore(workspace.getState().selectedIds)));
  click('undo-analysis', () => act(() => workspace.undo())); click('redo-analysis', () => act(() => workspace.redo()));
  click('undo-toast', () => { if (workspace?.getState().workspaceRevision === toastRevision) act(() => workspace.undo()); dismissToast(); });
  click('dismiss-toast', dismissToast);
  function toggleTable(open = !tableOpen) {
    filters.close(); tableOpen = open; render(); if (open) { animate($('analysis-table-pane')); if (focusedId) table.reveal(focusedId); }
  }
  click('overview-table-toggle', () => toggleTable()); click('graph-table-toggle', () => toggleTable());
  click('close-analysis-table', () => { toggleTable(false); $(task === 'overview' ? 'overview-table-toggle' : 'graph-table-toggle').focus({ preventScroll: true }); });
  click('table-all-columns', () => { allColumns = !allColumns; render(); });
  click('hidden-column-filters', () => { allColumns = true; render(); });
  function closePoint() {
    focusedId = null; render(); $(task === 'overview' ? 'overview-table-toggle' : 'graph-table-toggle').focus({ preventScroll: true });
  }
  click('close-point', closePoint);
  click('point-exclude', () => { if (act(() => workspace.exclude([focusedId], $('point-reason').value))) notify('1개를 제외했어요'); });
  click('point-restore', () => act(() => workspace.restore([focusedId])));
  root.addEventListener('keydown', event => { if (event.key === 'Escape' && focusedId !== null) closePoint(); }, { signal });
  for (const button of root.querySelectorAll('[data-export]')) button.addEventListener('click', () => onExport(button.dataset.export, button), { signal });
  function renderPoint(state, rows) {
    const sample = workspace?.getSamples().find(s => s.sampleId === focusedId);
    const inspector = $('point-inspector'), host = task === 'overview' ? $('analysis-table-pane') : root.querySelector('.graph-stage');
    if (inspector.parentElement !== host) host.append(inspector);
    inspector.hidden = !sample || (task === 'overview' && !tableOpen);
    if (!sample) return;
    const scope = scopeMembership(state), excluded = scope.excluded.has(focusedId);
    $('point-title').textContent = '자료 ' + sample.sampleId + ' · ' + statusLabels[scope.status(focusedId)];
    const values = [['수신 시각', new Date(sample.receivedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })],
      ['온도', sample.validity.temperatureC === 'valid' ? formatCalculated(sample.temperatureC) + ' ℃' : '값 없음'],
      ['기압', sample.validity.pressureHpa === 'valid' ? formatCalculated(sample.pressureHpa) + ' hPa' : '값 없음']];
    const point = [...(currentModel?.points ?? []), ...(currentModel?.excludedPoints ?? [])].find(p => p.sampleId === focusedId);
    if (point) for (const axis of ['x', 'y'])
      if (!['temperatureC', 'pressureHpa', 'receivedAt'].includes(currentModel[axis + 'ColumnId'])) values.push([currentModel[axis + 'Label'], formatCalculated(point[axis])]);
    const reason = state.exclusions.find(e => e.sampleId === focusedId)?.reason;
    if (reason) values.push(['제외 사유', reason]);
    $('point-values').replaceChildren(...values.flatMap(([name, value]) => {
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = name; dd.textContent = value; return [dt, dd];
    }));
    $('point-filter-notice').hidden = !tableOpen || rows.some(s => s.sampleId === focusedId);
    $('point-filter-notice').textContent = '표 필터에 가려진 자료입니다. 필터를 해제하면 표에서도 볼 수 있어요.';
    $('point-exclude').hidden = excluded; $('point-restore').hidden = !excluded;
    $('point-reason-label').hidden = excluded || !workspace.isWritable();
  }
  function render({ resetScroll = false } = {}) {
    const writable = workspace?.isWritable() ?? false;
    root.querySelectorAll('[data-workspace-action]').forEach(el => { el.disabled = !writable; });
    const state = workspace?.getState(), summary = workspace?.getSummary(), rows = workspace?.getRows() ?? [], samples = workspace?.getSamples() ?? [];
    currentModel = workspace?.getGraphData(context()) ?? null;
    if (currentModel && task === 'interpretation') currentModel.yLabel = '기압 (hPa)';
    const importedColumns = workspace?.getImportedColumns() ?? [], axisIds = task !== 'overview' && !allColumns && currentModel ? [currentModel.xColumnId, currentModel.yColumnId] : null;
    root.dataset.task = task; $('analysis-layout').dataset.tableOpen = String(tableOpen);
    root.querySelector('.analysis-tabs').style.setProperty('--active-tab', ['overview', 'relationship', 'interpretation'].indexOf(task));
    for (const button of root.querySelectorAll('[data-analysis-task]')) {
      if (button.dataset.analysisTask === task) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    $('overview-pane').hidden = task !== 'overview'; $('analysis-graph-pane').hidden = task === 'overview';
    $('analysis-table-pane').hidden = !tableOpen; $('interpretation-summary').hidden = task !== 'interpretation';
    $('graph-table-toggle').setAttribute('aria-expanded', String(tableOpen)); $('graph-table-toggle').textContent = tableOpen ? '표 접기' : '표 보기';
    $('overview-table-toggle').setAttribute('aria-expanded', String(tableOpen));
    $('table-all-columns').hidden = task === 'overview'; $('table-all-columns').setAttribute('aria-pressed', String(allColumns));
    $('table-all-columns').textContent = allColumns ? '축 열만 보기' : '전체 열';
    const shown = new Set(tableColumns(state?.calculatedColumns ?? [], axisIds, importedColumns).map(c => c.id));
    const hiddenFilters = tableColumns(state?.calculatedColumns ?? [], null, importedColumns).filter(c => !shown.has(c.id) && columnFilterActive(state?.table.filter ?? {}, c.id)).length;
    $('hidden-column-filters').hidden = !hiddenFilters; $('hidden-column-filters').textContent = '숨긴 열 필터 ' + hiddenFilters + '개 · 전체 열 보기';
    $('scope-count').textContent = '분석 포함 ' + number(summary?.includedCount ?? 0) + '개';
    $('scope-detail').textContent = '제외 ' + number(summary?.excludedCount ?? 0) + '개';
    const bounds = timeBounds(samples), elapsed = at => formatCalculated((at - bounds.origin) / 1000);
    $('scope-time').textContent = state?.appliedScope === 'all' ? '전체 자료' : state?.analysisRange && bounds
      ? elapsed(state.analysisRange.startAt) + '–' + elapsed(state.analysisRange.endAt) + '초' : '이전에 지정한 자료 ' + (summary?.candidateCount ?? 0) + '개';
    $('edit-analysis-range').disabled = !writable || !samples.length;
    for (const id of ['use-all-data', 'choose-range']) $(id).disabled = !writable || !samples.length;
    $('selection-toolbar').hidden = !summary?.selectedCount;
    $('selection-count').textContent = number(summary?.selectedCount ?? 0) + '개 선택';
    for (const id of ['exclude-selection', 'restore-selection', 'clear-selection']) $(id).disabled = !writable || !summary?.selectedCount;
    for (const [id, label] of [['undo-analysis', summary?.undoLabel], ['redo-analysis', summary?.redoLabel]]) {
      $(id).disabled = !writable || !label; $(id).title = (id === 'undo-analysis' ? '되돌리기' : '다시 실행') + (label ? ': ' + label : '');
    }
    const all = $('select-all'), count = summary?.visibleSelectedCount ?? 0;
    all.checked = rows.length > 0 && count === rows.length; all.indeterminate = count > 0 && count < rows.length; all.disabled = !writable || !rows.length;
    table.render({ samples: rows, selectedIds: state?.selectedIds ?? [], excluded: state?.exclusions ?? [], appliedIds: state?.appliedIds ?? [],
      focusedSampleId: focusedId, calculatedColumns: state?.calculatedColumns ?? [], importedColumns, axisIds,
      filter: state?.table.filter, sort: state?.table.sort ?? { columnId: 'sampleId', direction: 'asc' }, canEdit: writable, resetScroll });
    graph.render(state, currentModel, task !== 'overview', writable, focusedId);
    if (task === 'overview' && workspace) {
      overview ??= createChartView($('overview-chart'), { inspect: true, onLayout: () => range.layout(), onCursor(sample) {
        $('overview-readout').textContent = sample ? new Date(sample.receivedAt).toLocaleTimeString('ko-KR', { hour12: false, fractionalSecondDigits: 3 })
          + ' · 온도 ' + (sample.validity.temperatureC === 'valid' ? formatCalculated(sample.temperatureC) + ' ℃' : '값 없음')
          + ' · 기압 ' + (sample.validity.pressureHpa === 'valid' ? formatCalculated(sample.pressureHpa) + ' hPa' : '값 없음')
          : '그래프 위에서 같은 시점의 두 값을 확인할 수 있어요.';
      } });
      const key = state.runId + ':' + state.tableLastSampleId;
      if (overviewKey !== key) { overview.render(samples, 0, { range: 'all' }); overviewKey = key; }
      overview.resize(); range.layout();
    }
    $('overview-empty').hidden = samples.length > 0;
    if (state) range.update(samples, state);
    renderPoint(state, rows);
    for (const button of root.querySelectorAll('[data-export]'))
      button.disabled = !workspace || (button.dataset.export === 'analysis-csv' && !summary?.includedCount) || (button.dataset.export === 'png' && !currentModel);
    updateStatus();
  }
  function updateStatus() {
    if (!workspace || !store) { $('analysis-message').textContent = '저장된 실험을 열거나 먼저 측정해 주세요.'; $('apply-new-data').hidden = true; return; }
    const saved = store.getState(), loaded = workspace.getLoadedCount(), added = Math.max(0, saved.sampleCount - loaded);
    $('analysis-message').textContent = '자료 ' + number(loaded) + '개' + (!saved.writable ? ' · 읽기 전용' : '');
    $('analysis-message').title = '실험 전체 원자료 ' + number(saved.sampleCount) + '개 · 분석에 불러온 자료 ' + number(loaded) + '개';
    $('apply-new-data').textContent = '새 자료 ' + number(added) + '개 보기'; $('apply-new-data').hidden = !added; $('apply-new-data').disabled = !saved.writable || !added;
  }
  function reset() {
    store = null; workspace = null; task = 'overview'; tableOpen = allColumns = false; focusedId = null; currentModel = null;
    filters.close(); calculations.close(); graph.reset(); overview?.dispose(); overview = null; overviewKey = null; range.reset(); dismissToast();
  }
  return {
    open(nextStore) {
      if (nextStore !== store) {
        reset(); store = nextStore; $('analysis-feedback').textContent = ''; $('exclusion-reason').value = '';
        try { if (store) workspace = createWorkspace({ store }); } catch (error) { onError('분석 작업을 열지 못했어요. ' + error.message); }
        render({ resetScroll: true });
      } else render();
    },
    updateStatus, hasGraph: () => Boolean(workspace),
    exportPng: name => {
      const model = workspace?.getGraphData(context()); if (model && task === 'interpretation') model.yLabel = '기압 (hPa)';
      return exportAnalysisPng(model, { name });
    },
    reset,
    dispose() { reset(); events.abort(); table.dispose(); },
  };
}
