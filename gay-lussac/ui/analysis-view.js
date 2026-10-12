import { createWorkspace } from '../analysis/workspace.js';
import { createColumnFilters } from './column-filters.js';
import { createDataTable } from './data-table.js';
import { createCalculationEditor } from './calculation-editor.js';
import { createAnalysisGraph } from './analysis-graph.js';
import { tableColumns } from './table-columns.js';
import { columnFilterActive } from '../analysis/table-data.js';
import { exportAnalysisPng } from './chart-view.js';

export function createAnalysisView(root, { onError }) {
  const $ = id => root.querySelector('#' + id), events = new AbortController(), { signal } = events;
  let store = null, workspace = null, view = 'table';
  const number = value => value.toLocaleString('ko-KR');
  function act(action) {
    try { $('analysis-feedback').textContent = ''; action(); render(); }
    catch (error) { render(); $('analysis-feedback').textContent = error.message; }
  }
  const table = createDataTable({ body: $('raw-rows'), scroller: $('raw-scroll'), status: $('table-status'),
    onToggle(id, selected) { act(() => workspace.toggleSelection(id, selected)); },
    onSort(id) { act(() => workspace.setSort(id)); },
  });
  function click(id, action) { $(id).addEventListener('click', () => act(action), { signal }); }
  click('apply-new-data', () => workspace.showNewData());
  click('select-all', () => $('select-all').checked ? workspace.selectAll() : workspace.clearSelection());
  click('apply-selection', () => workspace.applyScope('selection'));
  click('apply-all', () => workspace.applyScope('all'));
  click('exclude-selection', () => {
    workspace.exclude(workspace.getState().selectedIds, $('exclusion-reason').value);
    $('exclusion-reason').value = '';
  });
  click('restore-selection', () => workspace.restore(workspace.getState().selectedIds));
  click('undo-analysis', () => workspace.undo());
  click('redo-analysis', () => workspace.redo());
  $('range-check').addEventListener('submit', event => {
    event.preventDefault(); act(() => workspace.selectRange(Number($('range-start').value), Number($('range-end').value)));
  }, { signal });
  const filters = createColumnFilters(root, { getWorkspace: () => workspace, act, signal });
  const calculations = createCalculationEditor(root, { getWorkspace: () => workspace, render, signal });
  const graph = createAnalysisGraph(root, { getWorkspace: () => workspace, act, signal,
    onSelect(id) {
      if (!workspace?.isWritable()) return;
      act(() => {
        const selected = new Set(workspace.getState().selectedIds);
        if (selected.has(id)) selected.delete(id); else selected.add(id);
        workspace.setSelection([...selected]);
      });
      if (view === 'split') table.reveal(id);
    },
  });
  function changeView(next) {
    filters.close(); calculations.close(); view = next; render();
  }
  for (const button of root.querySelectorAll('[data-analysis-view]')) button.addEventListener('click', () => changeView(button.dataset.analysisView), { signal });
  $('hidden-column-filters').addEventListener('click', () => changeView('table'), { signal });
  function render({ resetScroll = false } = {}) {
    const writable = workspace?.isWritable() ?? false;
    root.querySelectorAll('[data-workspace-action]').forEach(el => { el.disabled = !writable; });
    const state = workspace?.getState(), s = workspace?.getSummary(), rows = workspace?.getRows() ?? [];
    const importedColumns = workspace?.getImportedColumns() ?? [];
    const axisIds = view === 'split' ? state?.graph ? [state.graph.xColumnId, state.graph.yColumnId] : [] : null;
    $('analysis-layout').dataset.view = view;
    $('analysis-table-pane').hidden = view === 'graph'; $('analysis-graph-pane').hidden = view === 'table';
    $('table-status').hidden = view === 'graph';
    for (const button of root.querySelectorAll('[data-analysis-view]')) button.setAttribute('aria-pressed', String(button.dataset.analysisView === view));
    const shown = new Set(tableColumns(state?.calculatedColumns ?? [], axisIds, importedColumns).map(c => c.id));
    const hiddenFilters = tableColumns(state?.calculatedColumns ?? [], null, importedColumns).filter(c => !shown.has(c.id) && columnFilterActive(state?.table.filter ?? {}, c.id)).length;
    $('hidden-column-filters').hidden = !hiddenFilters;
    $('hidden-column-filters').textContent = `숨긴 열 필터 ${hiddenFilters}개 · 전체 표에서 보기`;
    $('scope-count').textContent = '분석에 사용할 자료 ' + number(s?.includedCount ?? 0) + '개';
    $('scope-detail').textContent = s ? '제외 ' + number(s.excludedCount) + '개' + (s.invalidCount ? ' · 값 확인 필요 ' + number(s.invalidCount) + '개' : '') : '';
    $('designated-analysis').hidden = state?.appliedScope !== 'selection';
    $('designated-count').textContent = s ? number(s.candidateCount) + '개' : '';
    $('selection-count').textContent = '체크 ' + number(s?.selectedCount ?? 0) + '개';
    for (const id of ['apply-selection', 'exclude-selection', 'restore-selection']) $(id).disabled = !writable || !s?.selectedCount;
    for (const [id, label] of [['undo-analysis', s?.undoLabel], ['redo-analysis', s?.redoLabel]]) {
      $(id).disabled = !writable || !label;
      const name = id === 'undo-analysis' ? '되돌리기' : '다시 실행';
      $(id).title = label ? name + ': ' + label : name;
    }
    const all = $('select-all'), count = s?.visibleSelectedCount ?? 0;
    all.checked = rows.length > 0 && count === rows.length;
    all.indeterminate = count > 0 && count < rows.length;
    all.disabled = !writable || !rows.length;
    table.render({ samples: rows, selectedIds: state?.selectedIds ?? [], excluded: state?.exclusions ?? [],
      calculatedColumns: state?.calculatedColumns ?? [],
      importedColumns,
      axisIds,
      filter: state?.table.filter, sort: state?.table.sort ?? { columnId: 'sampleId', direction: 'asc' }, canEdit: writable, resetScroll });
    graph.render(state, workspace?.getGraphData() ?? null, view !== 'table', writable);
    if (workspace) updateStatus();
    else { $('analysis-message').textContent = '저장된 실험을 열거나 먼저 측정해 주세요.'; $('apply-new-data').hidden = true; }
  }
  function updateStatus() {
    if (!workspace || !store) return;
    const saved = store.getState(), loaded = workspace.getLoadedCount(), added = Math.max(0, saved.sampleCount - loaded);
    $('analysis-message').textContent = '원자료 ' + number(saved.sampleCount) + '개 · 표에 불러온 자료 ' + number(loaded) + '개'
      + (saved.source === 'replay' ? ' · 재생 검증 자료' : saved.source === 'import' ? ' · 파일에서 가져온 자료' : '') + (!saved.writable ? ' · 읽기 전용' : '');
    $('apply-new-data').textContent = '새 자료 ' + number(added) + '개 보기';
    $('apply-new-data').hidden = !added; $('apply-new-data').disabled = !saved.writable || !added;
  }
  return {
    open(nextStore) {
      if (nextStore !== store) {
        store = nextStore; workspace = null; view = 'table'; graph.reset();
        filters.close(); calculations.close(); $('analysis-feedback').textContent = ''; $('exclusion-reason').value = '';
        $('range-start').value = $('range-end').value = '';
        try { if (store) workspace = createWorkspace({ store }); }
        catch (error) { onError('분석 작업을 열지 못했어요. ' + error.message); }
        render({ resetScroll: true });
      } else render();
    },
    updateStatus,
    hasGraph: () => Boolean(workspace?.getState().graph),
    exportPng: name => exportAnalysisPng(workspace?.getGraphData(), { name, selectedIds: workspace?.getState().selectedIds ?? [] }),
    reset() { store = null; workspace = null; view = 'table'; filters.close(); calculations.close(); graph.reset(); },
    dispose() { calculations.close(); events.abort(); table.dispose(); graph.dispose(); },
  };
}
