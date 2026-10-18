import { timeGraphData } from '../analysis/time-series.js';
import { positionPopover } from './anchored-popover.js';
import { createWorkspace } from '../analysis/workspace.js';
import { createColumnFilters } from './column-filters.js';
import { createDataTable } from './data-table.js';
import { createCalculationEditor } from './calculation-editor.js';
import { createAnalysisGraph } from './analysis-graph.js';
import { createRangeSelector } from './range-selector.js';
import { createReflectionView } from './reflection-view.js';
import { tableColumns } from './table-columns.js';
import { columnFilterActive } from '../analysis/table-data.js';
import { scopeMembership, statusLabels, timeBounds } from '../analysis/scope.js';
import { formatCalculated } from '../analysis/calculations.js';
import { formatElapsedTime } from '../analysis/clock-time.js';
import { exportAnalysisPng, createChartView } from './chart-view.js';

export function createAnalysisView(root, { onError, onExport = () => {} }) {
  const $ = id => root.querySelector('#' + id), events = new AbortController(), { signal } = events;
  let store = null, workspace = null, task = 'overview', tableOpen = false, allColumns = false, focusedId = null;
  let relationshipMode = 'split', overviewTableOpen = false, revealedColumnId = null;
  let overview = null, overviewKey = null, range = null, toastRevision = null, toastTimer = null, currentModel = null;
  const number = value => value.toLocaleString('ko-KR');
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
    closeExclusion(); focusedId = id === focusedId ? null : id; render();
  }
  const table = createDataTable({ body: $('raw-rows'), scroller: $('raw-scroll'), status: $('table-status'),
    onToggle(id, selected) { act(() => workspace.toggleSelection(id, selected)); },
    onSort(id) { act(() => workspace.setSort(id)); }, onInspect: inspect });
  const filters = createColumnFilters(root, { getWorkspace: () => workspace, act, signal });
  const calculations = createCalculationEditor(root, { getWorkspace: () => workspace,
    render({ revealColumnId } = {}) {
      if (revealColumnId) revealedColumnId = revealColumnId;
      if (task === 'relationship' && relationshipMode === 'graph') relationshipMode = 'split';
      if (task === 'overview') overviewTableOpen = true; render();
      if (revealColumnId) {
        const header = [...root.querySelectorAll('[data-column]')].find(el => el.dataset.column === revealColumnId);
        if (header) $('raw-scroll').scrollLeft = header.offsetLeft - 32;
      }
    }, signal });
  const graph = createAnalysisGraph(root, { getWorkspace: () => workspace, act, signal, onSelect: inspect });
  let layoutTimer = null;
  function finishLayoutTransition() {
    clearTimeout(layoutTimer); layoutTimer = null; graph.endLayoutTransition();
  }
  $('analysis-layout').addEventListener('transitionend', event => {
    if (event.target === $('analysis-layout') && event.propertyName === 'grid-template-columns') finishLayoutTransition();
  }, { signal });
  const reflection = createReflectionView(root, { getWorkspace: () => workspace, getStoreState: () => store?.getState(), act,
    onBack: () => changeTask('relationship'), signal });
  range = createRangeSelector(root, { getChart: () => overview, signal,
    onApply(draft) { if (act(() => workspace.applyTimeRange(draft))) { range.close(); changeTask('relationship'); } },
    onClose() { $('choose-range').focus({ preventScroll: true }); } });
  function click(id, action) { $(id).addEventListener('click', action, { signal }); }
  function changeTask(next) {
    if (!reflection.flush()) return;
    finishLayoutTransition();
    if (next === 'interpretation' && workspace?.isWritable() && !workspace.getState().reflection.evidence && workspace.getGraphData().points.length) {
      if (!act(() => workspace.captureReflection())) return;
    }
    closeExclusion(); filters.close(); calculations.close(); focusedId = null; task = next;
    render();
    animate($(next === 'overview' ? 'overview-pane' : next === 'interpretation' ? 'reflection-pane' : 'analysis-graph-pane'));
  }
  for (const button of root.querySelectorAll('[data-analysis-task]'))
    button.addEventListener('click', () => changeTask(button.dataset.analysisTask), { signal });
  click('use-graph-for-reflection', () => {
    if (reflection.flush() && act(() => workspace.captureReflection())) {
      changeTask('interpretation');
      $('reflection-notice').textContent = Object.values(workspace.getState().reflection.answers).some(text => text.trim())
        ? '가져온 그래프와 작성한 설명이 잘 연결되는지 확인해 보세요.' : '';
      root.querySelector('.analysis-tabs').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
      $('reflection-title').focus({ preventScroll: true });
    }
  });
  function openRange() {
    if (!workspace?.isWritable()) return;
    changeTask('overview'); range.open(workspace.getState()); animate($('range-form'));
  }
  click('choose-range', openRange); click('edit-analysis-range', openRange);
  click('use-all-data', () => { if (act(() => workspace.applyScope('all'))) { range.close(); changeTask('relationship'); } });
  click('apply-new-data', () => act(() => workspace.showNewData()));
  click('select-all', () => act(() => $('select-all').checked ? workspace.selectAll() : workspace.clearSelection()));
  click('clear-selection', () => { if (act(() => workspace.clearSelection())) $('raw-scroll').focus({ preventScroll: true }); });
  const exclusionPanel = $('selection-exclusion-panel');
  let exclusionIds = [], exclusionAnchor = null;
  function closeExclusion() { exclusionPanel.hidePopover(); exclusionAnchor?.setAttribute('aria-expanded', 'false'); }
  function positionExclusion() { positionPopover(exclusionPanel, exclusionAnchor); }
  function openExclusion(ids, anchor) {
    closeExclusion(); exclusionIds = [...ids]; exclusionAnchor = anchor;
    $('exclusion-reason').value = ''; exclusionPanel.showPopover(); positionExclusion(); $('exclusion-reason').focus({ preventScroll: true });
  }
  exclusionPanel.addEventListener('toggle', () => exclusionAnchor?.setAttribute('aria-expanded', String(exclusionPanel.matches(':popover-open'))), { signal });
  root.addEventListener('scroll', positionExclusion, { capture: true, signal });
  window.addEventListener('resize', positionExclusion, { signal });
  click('cancel-selection-exclusion', () => { closeExclusion(); exclusionAnchor?.focus({ preventScroll: true }); });
  click('exclude-selection', () => openExclusion(workspace.getState().selectedIds, $('exclude-selection')));
  click('apply-selection-exclusion', () => {
    const ids = exclusionIds, count = ids.filter(id => !workspace.getState().exclusions.some(e => e.sampleId === id)).length;
    if (act(() => workspace.exclude(ids, $('exclusion-reason').value))) {
      closeExclusion(); $('exclusion-reason').value = ''; (exclusionAnchor?.hidden ? $('raw-scroll') : exclusionAnchor)?.focus({ preventScroll: true }); if (count) notify(number(count) + '개를 제외했어요');
    }
  });
  click('restore-selection', () => act(() => workspace.restore(workspace.getState().selectedIds)));
  click('undo-analysis', () => act(() => workspace.undo())); click('redo-analysis', () => act(() => workspace.redo()));
  click('undo-toast', () => { if (workspace?.getState().workspaceRevision === toastRevision) act(() => workspace.undo()); dismissToast(); });
  click('dismiss-toast', dismissToast);
  click('overview-table-toggle', () => {
    closeExclusion(); filters.close(); overviewTableOpen = !overviewTableOpen; render();
    if (overviewTableOpen) animate($('analysis-table-pane'));
  });
  const modeButtons = [...root.querySelectorAll('[data-relationship-mode]')];
  function setRelationshipMode(mode) {
    if (relationshipMode === mode) return;
    clearTimeout(layoutTimer);
    if (!reduced() && window.matchMedia('(min-width: 1001px)').matches) {
      graph.beginLayoutTransition();
      // Also finish when a task change, hidden tab or breakpoint cancels CSS events.
      const duration = parseFloat(getComputedStyle(root).getPropertyValue('--analysis-duration'));
      layoutTimer = setTimeout(finishLayoutTransition, duration + 100);
    } else finishLayoutTransition();
    closeExclusion(); filters.close(); calculations.close(); relationshipMode = mode; render();
  }
  for (const [index, button] of modeButtons.entries()) {
    button.addEventListener('click', () => setRelationshipMode(button.dataset.relationshipMode), { signal });
    button.addEventListener('keydown', event => {
      const next = event.key === 'ArrowRight' ? (index + 1) % 3 : event.key === 'ArrowLeft' ? (index + 2) % 3
        : event.key === 'Home' ? 0 : event.key === 'End' ? 2 : null;
      if (next === null) return;
      event.preventDefault(); modeButtons[next].focus({ preventScroll: true });
      setRelationshipMode(modeButtons[next].dataset.relationshipMode);
    }, { signal });
  }
  function closePoint() {
    const focusInside = $('point-inspector').contains(document.activeElement);
    closeExclusion(); focusedId = null; render();
    if (focusInside) $(tableOpen ? 'raw-scroll' : 'analysis-chart').focus({ preventScroll: true });
  }
  click('close-point', closePoint);
  click('point-exclude', () => openExclusion([focusedId], $('point-exclude')));
  click('point-restore', () => act(() => workspace.restore([focusedId])));
  root.addEventListener('keydown', event => { if (event.key === 'Escape' && focusedId !== null && !root.querySelector(':popover-open, dialog[open]')) closePoint(); }, { signal });
  for (const button of root.querySelectorAll('[data-export]')) button.addEventListener('click', () => { if (reflection.flush()) onExport(button.dataset.export, button); }, { signal });
  function renderPoint(state, rows, samples) {
    const sample = samples.find(s => s.sampleId === focusedId);
    const inspector = $('point-inspector'), host = $(tableOpen ? 'table-point-slot' : 'graph-point-slot');
    $('graph-point-slot').hidden = tableOpen;
    for (const slot of [$('table-point-slot'), $('graph-point-slot')]) slot.dataset.active = String(slot === host && Boolean(sample));
    if (inspector.parentElement !== host) host.append(inspector);
    inspector.hidden = !sample || (task === 'overview' && !tableOpen);
    if (!sample) return;
    const scope = scopeMembership(state), excluded = scope.excluded.has(focusedId);
    $('point-title').textContent = (task === 'overview'
      ? formatElapsedTime((sample.receivedAt - samples[0].receivedAt) / 1000)
      : '자료 ' + sample.sampleId) + ' · ' + statusLabels[scope.status(focusedId)];
    $('point-time').textContent = new Date(sample.receivedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
    const values = [
      ['온도', sample.validity.temperatureC === 'valid' ? formatCalculated(sample.temperatureC) + ' ℃' : '값 없음'],
      ['기압', sample.validity.pressureHpa === 'valid' ? formatCalculated(sample.pressureHpa) + ' hPa' : '값 없음']];
    const point = [...(currentModel?.points ?? []), ...(currentModel?.excludedPoints ?? [])].find(p => p.sampleId === focusedId);
    if (point) for (const axis of ['x', 'y'])
      if (!['temperatureC', 'pressureHpa', 'receivedAt'].includes(currentModel[axis + 'ColumnId'])) values.push([currentModel[axis + 'Label'], formatCalculated(point[axis])]);
    const reason = state.exclusions.find(e => e.sampleId === focusedId)?.reason;
    if (reason) values.push(['제외 사유', reason]);
    $('point-values').replaceChildren(...values.map(([name, value]) => {
      const pair = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = name; dd.textContent = value; pair.append(dt, dd); return pair;
    }));
    $('point-filter-notice').hidden = !tableOpen || rows.some(s => s.sampleId === focusedId);
    $('point-filter-notice').textContent = '표 필터에 가려진 자료입니다. 필터를 해제하면 표에서도 볼 수 있어요.';
    $('point-exclude').hidden = excluded; $('point-restore').hidden = !excluded;
  }
  function render({ resetScroll = false } = {}) {
    tableOpen = task === 'overview' ? overviewTableOpen : relationshipMode !== 'graph';
    allColumns = task === 'relationship' && relationshipMode === 'table';
    const viewModel = workspace?.getViewModel(), writable = viewModel?.writable ?? false;
    root.querySelectorAll('[data-workspace-action]').forEach(el => { el.disabled = !writable; });
    const state = viewModel?.state, summary = viewModel?.summary, rows = viewModel?.rows ?? [], samples = viewModel?.samples ?? [];
    currentModel = viewModel?.graph ?? null;
    const importedColumns = viewModel?.importedColumns ?? [], axisIds = task !== 'overview' && !allColumns && currentModel ? [currentModel.xColumnId, currentModel.yColumnId, ...(revealedColumnId ? [revealedColumnId] : [])] : null;
    root.dataset.task = task; $('analysis-layout').dataset.tableOpen = String(tableOpen);
    $('analysis-layout').dataset.tableOnly = String(task === 'relationship' && allColumns);
    root.querySelector('.analysis-tabs').style.setProperty('--active-tab', ['overview', 'relationship', 'interpretation'].indexOf(task));
    for (const button of root.querySelectorAll('[data-analysis-task]')) {
      if (button.dataset.analysisTask === task) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    $('overview-pane').hidden = task !== 'overview'; $('analysis-graph-pane').hidden = task !== 'relationship';
    $('analysis-graph-pane').inert = allColumns;
    $('analysis-graph-pane').setAttribute('aria-hidden', String(allColumns));
    $('analysis-layout').hidden = task === 'interpretation'; root.querySelector('.analysis-scope-bar').hidden = task === 'interpretation';
    $('reflection-pane').hidden = task !== 'interpretation';
    $('analysis-table-pane').hidden = task !== 'relationship' && !tableOpen;
    $('analysis-table-pane').inert = !tableOpen;
    $('analysis-table-pane').setAttribute('aria-hidden', String(!tableOpen));
    $('relationship-layout-control').hidden = task !== 'relationship';
    $('relationship-layout-control').style.setProperty('--active-tab', ['table', 'split', 'graph'].indexOf(relationshipMode));
    for (const button of modeButtons) button.setAttribute('aria-pressed', String(button.dataset.relationshipMode === relationshipMode));
    $('overview-table-toggle').setAttribute('aria-expanded', String(tableOpen));
    const shown = new Set(tableColumns(state?.calculatedColumns ?? [], axisIds, importedColumns).map(c => c.id));
    const hiddenFilters = tableColumns(state?.calculatedColumns ?? [], null, importedColumns).filter(c => (axisIds !== null || !shown.has(c.id)) && columnFilterActive(state?.table.filter ?? {}, c.id)).length;
    $('hidden-column-filters').hidden = !hiddenFilters; $('hidden-column-filters').textContent = '표 필터 ' + hiddenFilters + '개 적용 중 · 상단의 ‘표’ 보기에서 확인';
    $('scope-count').textContent = '분석 포함 ' + number(summary?.includedCount ?? 0) + '개';
    $('scope-detail').textContent = '제외 ' + number(summary?.excludedCount ?? 0) + '개';
    const bounds = timeBounds(samples), elapsed = at => formatCalculated((at - bounds.origin) / 1000);
    $('scope-time').textContent = state?.appliedScope === 'all' ? '전체 자료' : state?.analysisRange && bounds
      ? elapsed(state.analysisRange.startAt) + '–' + elapsed(state.analysisRange.endAt) + '초' : '이전에 지정한 자료 ' + (summary?.candidateCount ?? 0) + '개';
    $('edit-analysis-range').disabled = !writable || !samples.length;
    for (const id of ['use-all-data', 'choose-range']) $(id).disabled = !writable || !samples.length;
    $('selection-toolbar').dataset.active = String(Boolean(summary?.selectedCount));
    $('selection-toolbar').inert = !summary?.selectedCount;
    if (!writable || (exclusionAnchor === $('exclude-selection') && !summary?.selectedCount)) closeExclusion();
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
    graph.render(state, currentModel, task === 'relationship' && !allColumns, writable, focusedId);
    $('use-graph-for-reflection').disabled = !writable || !currentModel?.points.length;
    reflection.render(task === 'interpretation', viewModel);
    if (task === 'overview' && workspace) {
      overview ??= createChartView($('overview-chart'), { inspect: true, onLayout: () => range.layout(), onCursor(sample, elapsedSeconds) {
        $('overview-readout').textContent = sample ? formatElapsedTime(elapsedSeconds)
          + ' · 온도 ' + (sample.validity.temperatureC === 'valid' ? formatCalculated(sample.temperatureC) + ' ℃' : '값 없음')
          + ' · 기압 ' + (sample.validity.pressureHpa === 'valid' ? formatCalculated(sample.pressureHpa) + ' hPa' : '값 없음')
          : '그래프 위에서 같은 시점의 두 값을 확인할 수 있어요.';
      } });
      const key = state.runId + ':' + state.tableLastSampleId;
      if (overviewKey !== key) { overview.render(timeGraphData(samples, 0, { range: 'all' })); overviewKey = key; }
      overview.resize(); range.layout();
    }
    $('overview-empty').hidden = samples.length > 0;
    if (state) range.update(samples, state);
    renderPoint(state, rows, samples);
    for (const button of root.querySelectorAll('[data-export]'))
      button.disabled = !workspace || (button.dataset.export === 'analysis-csv' && !summary?.includedCount) || (button.dataset.export === 'png' && !currentModel);
    updateStatus();
  }
  function updateStatus() {
    reflection.updateStatus();
    if (!workspace || !store) { $('analysis-message').textContent = '저장된 실험을 열거나 먼저 측정해 주세요.'; $('apply-new-data').hidden = true; return; }
    const saved = store.getState(), loaded = workspace.getLoadedCount(), added = Math.max(0, saved.sampleCount - loaded);
    $('analysis-message').textContent = '자료 ' + number(loaded) + '개' + (!saved.writable ? ' · 읽기 전용' : '');
    $('analysis-message').title = '실험 전체 원자료 ' + number(saved.sampleCount) + '개 · 분석에 불러온 자료 ' + number(loaded) + '개';
    $('apply-new-data').textContent = '새 자료 ' + number(added) + '개 반영'; $('apply-new-data').hidden = !added; $('apply-new-data').disabled = !saved.writable || !added;
  }
  function reset() {
    clearTimeout(layoutTimer); layoutTimer = null;
    store = null; workspace = null; task = 'overview'; tableOpen = allColumns = overviewTableOpen = false; relationshipMode = 'split'; revealedColumnId = null; focusedId = null; currentModel = null;
    closeExclusion(); filters.close(); calculations.close(); graph.reset(); reflection.reset(); overview?.dispose(); overview = null; overviewKey = null; range.reset(); dismissToast();
  }
  return {
    open(nextStore) {
      if (nextStore !== store) {
        reset(); store = nextStore; $('analysis-feedback').textContent = ''; $('exclusion-reason').value = '';
        try { if (store) workspace = createWorkspace({ store }); } catch (error) { onError('분석 작업을 열지 못했어요. ' + error.message); }
        render({ resetScroll: true });
      } else render();
    },
    updateStatus, hasGraph: () => Boolean(workspace && (task !== 'interpretation' || workspace.getReflectionModel())),
    exportPng: name => {
      const model = task === 'interpretation' ? workspace?.getReflectionModel() : workspace?.getGraphData();
      return exportAnalysisPng(model, { name });
    },
    reset,
    dispose() { reset(); events.abort(); table.dispose(); },
  };
}
