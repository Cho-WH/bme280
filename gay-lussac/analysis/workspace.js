import { DEFAULT_FILTER, TABLE_COLUMNS, tableRows, analysisScope, normalizeFilter, columnRanges } from './table-data.js';
import { validateCalculatedColumns, validateGraph, validateImportedColumns, DEFAULT_GRAPH, validateInterpretation } from '../data/contracts.js';
import { rangeSampleIds, validateAnalysisRange, timeBounds } from './scope.js';
import { createCalculator, presetColumns } from './calculations.js';
import { graphData } from './graph-data.js';
import { fitGraph, trendGeometry } from './regression.js';

const copy = structuredClone;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const orderedIds = ids => [...new Set(ids)].sort((a, b) => a - b);
const historyState = state => ({ appliedIds: state.appliedIds, appliedScope: state.appliedScope, analysisRange: state.analysisRange, interpretation: state.interpretation, exclusions: state.exclusions, calculatedColumns: state.calculatedColumns, graph: state.graph,
  regression: { enabled: state.regression?.enabled === true } });
const inputState = state => {
  const applied = new Set(state.appliedIds);
  const byId = new Map(state.calculatedColumns.map(c => [c.id, c])), needed = new Set();
  function visit(id) {
    if (needed.has(id) || !byId.has(id)) return;
    needed.add(id);
    for (const operand of [byId.get(id).lhs, byId.get(id).rhs]) if (operand.kind === 'column') visit(operand.columnId);
  }
  (state.graph ? [state.graph.xColumnId, state.graph.yColumnId] : [...byId.keys()]).forEach(visit);
  return { axes: state.graph ? [state.graph.xColumnId, state.graph.yColumnId] : null,
    calculations: state.calculatedColumns.filter(c => needed.has(c.id)).map(({ id, lhs, op, rhs }) => ({ id, lhs, op, rhs })),
    appliedIds: state.appliedIds, excludedIds: state.exclusions.filter(e => applied.has(e.sampleId)).map(e => e.sampleId) };
};

// Owns editable definitions; samples are a read-only projection from RunStore snapshots.
// Every change is copied into RunStore immediately. Only the database write is delayed.
export function createWorkspace({ store }) {
  const snapshot = store.getSnapshot();
  let samples = snapshot.samples;
  const imported = validateImportedColumns(snapshot.run.importedColumns ?? []);
  const writable = store.getState().writable;
  const initialIds = samples.map(s => s.sampleId);
  let state = snapshot.workspace ? copy(snapshot.workspace) : {
    runId: snapshot.run.id, workspaceRevision: 0, analysisInputRevision: 0,
    tableLastSampleId: initialIds.at(-1) ?? 0,
    table: { sort: { columnId: 'sampleId', direction: 'asc' }, filter: { ...DEFAULT_FILTER } },
    selectedIds: [], appliedIds: initialIds, appliedScope: 'all', exclusions: [],
    calculatedColumns: [], graph: null, regression: null, note: '',
  };
  // Ignore legacy scroll positions; scrolling belongs only to the live table view.
  delete state.table.scrollTop;
  state.calculatedColumns = validateCalculatedColumns(state.calculatedColumns ?? [], imported);
  state.graph = validateGraph(state.graph, state.calculatedColumns, imported);
  state.regression = { enabled: state.regression?.enabled === true };
  state.analysisRange = validateAnalysisRange(state.analysisRange, samples, state);
  state.interpretation = validateInterpretation(state.interpretation);
  state.table.filter = normalizeFilter(state.table.filter, [...imported, ...state.calculatedColumns]);
  if (state.table.sort.columnId === 'segmentId') state.table.sort = { columnId: 'sampleId', direction: 'asc' };
  const undo = [], redo = [];
  let loadedCount = samples.filter(s => s.sampleId <= state.tableLastSampleId).length;
  let anchorId = null;
  let projection = null;
  let interpretationCache = null;
  function projected(next = state, source = samples) {
    const key = JSON.stringify(next.calculatedColumns);
    if (projection?.samples !== source || projection.key !== key) {
      const calculate = createCalculator(next.calculatedColumns, imported);
      projection = { samples: source, key, rows: next.calculatedColumns.length
        ? source.map(s => ({ ...s, calculations: calculate(s) })) : source };
    }
    return projection.rows;
  }
  const rowsFor = (next = state) => tableRows(projected(next), next);
  function assertWriter() { if (!writable) throw new Error('다른 탭에서 작성 중인 실험은 읽기 전용이에요.'); }
  function updateRegression(next, source = samples, force = false) {
    if (!next.graph || !next.regression?.enabled) {
      next.regression = { enabled: false };
      if (next.graph) next.graph.view = 'measured';
      return;
    }
    if (force || next.regression.inputRevision !== next.analysisInputRevision || !next.regression.result)
      next.regression = fitGraph(graphData(projected(next, source), next, imported), next.analysisInputRevision);
    if (next.graph.view === 'extended' && !trendGeometry(next.regression, true).intercept.length) next.graph.view = 'measured';
  }
  // Derived numbers from older saves are never trusted as current results.
  updateRegression(state, samples, true);
  function commit(next, label = null, source = samples) {
    assertWriter();
    if (same(state, next)) return false;
    const inputChanged = !same(inputState(state), inputState(next));
    next.workspaceRevision = state.workspaceRevision + 1;
    next.analysisInputRevision = state.analysisInputRevision + Number(inputChanged);
    updateRegression(next, source);
    store.saveWorkspace(copy(next));
    if (label && !same(historyState(state), historyState(next))) {
      undo.push({ label, before: copy(historyState(state)), after: copy(historyState(next)) }); redo.length = 0;
    }
    state = next;
    return true;
  }
  if (!snapshot.workspace && writable) {
    state.workspaceRevision = 1;
    store.saveWorkspace(copy(state));
  }
  function loadedIds() { return samples.filter(s => s.sampleId <= state.tableLastSampleId).map(s => s.sampleId); }
  // Older workspaces could keep a partial candidate set even in 'all' mode.
  // Preserve those inputs as a designated analysis instead of expanding them on open.
  if (snapshot.workspace && state.appliedScope === 'all' && !same(orderedIds(state.appliedIds), orderedIds(loadedIds()))) {
    const next = { ...copy(state), appliedScope: 'selection' };
    if (writable) commit(next); else state = next;
  }
  function validateIds(ids) {
    const allowed = new Set(loadedIds());
    if (ids.some(id => !allowed.has(id))) throw new Error('먼저 새 자료 보기를 눌러 표에 자료를 불러오세요.');
    return orderedIds(ids);
  }
  function setSelection(ids) { return commit({ ...copy(state), selectedIds: validateIds(ids) }); }
  function selectRange(min, max) {
    if (![min, max].every(v => Number.isSafeInteger(v) && v >= 1) || min > max || max > state.tableLastSampleId)
      throw new Error('표에 불러온 자료 ID 안에서 시작과 끝을 입력하세요.');
    const changed = setSelection(rowsFor().filter(s => s.sampleId >= min && s.sampleId <= max).map(s => s.sampleId));
    anchorId = null;
    return changed;
  }
  function toggleSelection(id, { extend = false, checked = !state.selectedIds.includes(id) } = {}) {
    const ids = rowsFor().map(s => s.sampleId);
    const end = ids.indexOf(id), start = extend ? ids.indexOf(anchorId) : -1;
    if (end < 0) return false;
    const target = start < 0 ? [id] : ids.slice(Math.min(start, end), Math.max(start, end) + 1);
    const selected = new Set(state.selectedIds);
    target.forEach(value => checked ? selected.add(value) : selected.delete(value));
    if (!extend || start < 0) anchorId = id;
    return setSelection([...selected]);
  }
  function command(next, label) {
    // Persist the action and its cleared checkboxes together. A failed save changes neither.
    const changed = commit({ ...next, selectedIds: [] }, label);
    anchorId = null;
    return changed;
  }
  function applyScope(mode) {
    if (!['selection', 'all'].includes(mode)) throw new Error('분석 범위를 확인하세요.');
    const ids = mode === 'selection' ? state.selectedIds : loadedIds();
    if (!ids.length && mode === 'selection') throw new Error('분석할 행을 먼저 선택하세요.');
    return command({ ...copy(state), appliedIds: orderedIds(ids), appliedScope: mode, analysisRange: null }, mode === 'selection' ? '지정 분석' : '전체 자료 분석');
  }
  function applyTimeRange(range) {
    const loaded = samples.filter(s => s.sampleId <= state.tableLastSampleId);
    const ids = rangeSampleIds(loaded, range), bounds = timeBounds(loaded);
    if (!ids.length) throw new Error('선택한 구간에 자료가 없어요. 시간을 다시 골라 주세요.');
    if (range.startAt < bounds.startAt || range.endAt > bounds.endAt) throw new Error('불러온 자료의 시간 안에서 구간을 골라 주세요.');
    return command({ ...copy(state), appliedIds: orderedIds(ids), appliedScope: 'selection',
      analysisRange: { startAt: range.startAt, endAt: range.endAt, throughSampleId: state.tableLastSampleId } }, '분석 구간 변경');
  }
  function exclude(ids, reason = '') {
    const target = validateIds(ids);
    if (!target.length) throw new Error('제외할 행을 먼저 선택하세요.');
    const entries = new Map(state.exclusions.map(e => [e.sampleId, e]));
    target.forEach(sampleId => {
      if (!entries.has(sampleId)) entries.set(sampleId, { sampleId, reason: reason.trim().slice(0, 200) });
    });
    return command({ ...copy(state), exclusions: [...entries.values()].sort((a, b) => a.sampleId - b.sampleId) }, '자료 제외');
  }
  function restore(ids) {
    const target = new Set(validateIds(ids));
    return command({ ...copy(state), exclusions: state.exclusions.filter(e => !target.has(e.sampleId)) }, '제외 해제');
  }
  function setFilter(filter) {
    const f = normalizeFilter(filter, [...imported, ...state.calculatedColumns]);
    const changed = commit({ ...copy(state), selectedIds: [], table: { ...copy(state.table), filter: copy(f) } });
    anchorId = null;
    return changed;
  }
  function setSort(columnId) {
    if (![...TABLE_COLUMNS, ...imported, ...state.calculatedColumns].some(c => c.id === columnId)) throw new Error('정렬할 열이 없어요.');
    const direction = state.table.sort.columnId === columnId && state.table.sort.direction === 'asc' ? 'desc' : 'asc';
    return commit({ ...copy(state), table: { ...copy(state.table), sort: { columnId, direction } } });
  }
  function showNewData() {
    assertWriter();
    const next = store.getSnapshot();
    if (next.run.id !== state.runId) throw new Error('열린 실험이 바뀌었어요.');
    const changed = commit({ ...copy(state), tableLastSampleId: next.samples.at(-1)?.sampleId ?? 0,
      appliedIds: state.appliedScope === 'all' ? next.samples.map(s => s.sampleId) : state.appliedIds }, null, next.samples);
    samples = next.samples;
    loadedCount = samples.length;
    return changed;
  }
  function replaceColumns(definitions, label) {
    const next = { ...copy(state), calculatedColumns: validateCalculatedColumns(definitions, imported) };
    reconcileTableColumns(next);
    const visible = new Set(rowsFor(next).map(s => s.sampleId));
    next.selectedIds = next.selectedIds.filter(id => visible.has(id));
    return commit(next, label);
  }
  function columnDraft(definition, prerequisites = []) {
    const index = state.calculatedColumns.findIndex(c => c.id === definition.id);
    const columns = copy(state.calculatedColumns);
    const pending = new Map(prerequisites.map(c => [c.id, c])), needed = new Set();
    function visit(c) {
      for (const operand of [c.lhs, c.rhs]) {
        if (operand?.kind !== 'column' || !pending.has(operand.columnId) || needed.has(operand.columnId)) continue;
        needed.add(operand.columnId); visit(pending.get(operand.columnId));
      }
    }
    visit(definition);
    // Unused template helpers disappear with the draft, never becoming orphan columns.
    columns.push(...prerequisites.filter(c => needed.has(c.id)));
    if (index < 0) columns.push(definition); else columns[index] = definition;
    return columns;
  }
  function saveColumn(definition, prerequisites = []) {
    const existing = state.calculatedColumns.some(c => c.id === definition.id);
    return replaceColumns(columnDraft(definition, prerequisites), existing ? '계산 열 편집' : '계산 열 추가');
  }
  function columnUsers(id) {
    const users = state.calculatedColumns.filter(c => [c.lhs, c.rhs].some(o => o.kind === 'column' && o.columnId === id)).map(c => c.name);
    if ([state.graph?.xColumnId, state.graph?.yColumnId].includes(id)) users.push('그래프 축');
    const range = columnRanges(state.table.filter)[id];
    if (range && (range.min != null || range.max != null)) users.push('이 열의 필터');
    if (state.table.sort.columnId === id) users.push('이 열의 정렬');
    return users;
  }
  function deleteColumn(id) {
    if (!state.calculatedColumns.some(c => c.id === id)) throw new Error('삭제할 계산 열이 없습니다.');
    const users = columnUsers(id);
    if (users.length) throw new Error('먼저 사용 중인 항목을 변경하거나 해제하세요: ' + users.join(', '));
    return replaceColumns(state.calculatedColumns.filter(c => c.id !== id), '계산 열 삭제');
  }
  function previewColumn(definition, prerequisites = []) {
    const calculate = createCalculator(columnDraft(definition, prerequisites), imported);
    const ids = new Set(state.appliedIds), excluded = new Set(state.exclusions.map(e => e.sampleId));
    return samples.filter(s => ids.has(s.sampleId) && !excluded.has(s.sampleId)).slice(0, 3)
      .map(s => {
        const values = calculate(s);
        const inputs = [definition.lhs, definition.rhs].map(o => o.kind === 'constant' ? { value: o.value, reason: null }
          : values[o.columnId] ?? s.importedValues?.[o.columnId] ?? { value: s.validity[o.columnId] === 'valid' ? s[o.columnId] : null, reason: s.validity[o.columnId] === 'valid' ? null : '입력값 없음' });
        return { sampleId: s.sampleId, ...values[definition.id], inputs };
      });
  }
  function reconcileTableColumns(next) {
    // Keep live table settings, removing only references to absent calculated columns.
    const available = new Set([...TABLE_COLUMNS, ...imported, ...next.calculatedColumns].map(c => c.id));
    const ranges = columnRanges(next.table.filter), removed = Object.keys(ranges).filter(id => !available.has(id));
    if (removed.length || !available.has(next.table.filter.columnId)) {
      removed.forEach(id => delete ranges[id]);
      next.table.filter = { ...next.table.filter, columnId: 'sampleId', min: null, max: null, ranges };
    }
    if (!available.has(next.table.sort.columnId)) next.table.sort = { columnId: 'sampleId', direction: 'asc' };
  }
  function travel(from, to, direction) {
    assertWriter();
    const item = from.at(-1);
    if (!item) return false;
    const next = { ...copy(state), ...copy(item[direction]) };
    if (next.appliedScope === 'all') next.appliedIds = loadedIds();
    reconcileTableColumns(next);
    // Undoing a status change can hide checked rows under the current status filter.
    const visible = new Set(rowsFor(next).map(s => s.sampleId));
    next.selectedIds = next.selectedIds.filter(id => visible.has(id));
    commit(next);
    anchorId = null;
    from.pop(); to.push(item); return true;
  }
  function getGraphData(context = 'relationship') {
    const interpretation = context === 'interpretation';
    const graph = interpretation ? { ...DEFAULT_GRAPH, view: state.interpretation.view } : state.graph ?? DEFAULT_GRAPH;
    const model = graphData(projected(), { ...state, graph }, imported);
    let regression = state.regression;
    if (interpretation) {
      const key = JSON.stringify([state.appliedIds, state.exclusions.map(e => e.sampleId), state.interpretation.enabled]);
      if (interpretationCache?.key !== key || interpretationCache.samples !== samples)
        interpretationCache = { key, samples, regression: state.interpretation.enabled ? fitGraph(model, state.analysisInputRevision) : { enabled: false } };
      regression = { ...interpretationCache.regression, ...(interpretationCache.regression.enabled ? { inputRevision: state.analysisInputRevision } : {}) };
    }
    const trend = trendGeometry(regression, graph.view === 'extended');
    return { ...model, view: graph.view === 'extended' && !trend.intercept.length ? 'measured' : graph.view,
      regression: copy(regression), trend };
  }
  return {
    getState: () => copy(state), isWritable: () => writable, getLoadedCount: () => loadedCount,
    getRows: () => rowsFor(),
    getImportedColumns: () => copy(imported),
    getSamples: () => projected().filter(s => s.sampleId <= state.tableLastSampleId),
    getGraphData,
    getSummary() {
      const rows = rowsFor(), selected = new Set(state.selectedIds);
      return { ...analysisScope(samples, state), loadedCount,
        selectedCount: selected.size, visibleSelectedCount: rows.filter(s => selected.has(s.sampleId)).length,
        undoLabel: undo.at(-1)?.label ?? '', redoLabel: redo.at(-1)?.label ?? '' };
    },
    setSelection, selectRange, toggleSelection, applyScope, applyTimeRange, exclude, restore, setFilter, setSort, showNewData,
    saveColumn, deleteColumn, columnUsers, previewColumn,
    setGraph(graph) { return commit({ ...copy(state), graph: validateGraph({ ...graph, view: state.graph?.view }, state.calculatedColumns, imported) }, state.graph ? '그래프 변경' : '그래프 만들기'); },
    setTrendEnabled(enabled, context = 'relationship') {
      if (typeof enabled !== 'boolean') throw new Error('추세선 표시 상태를 확인하세요.');
      if (context === 'interpretation') return commit({ ...copy(state), interpretation: { enabled,
        view: enabled ? state.interpretation.view : 'measured' } }, '결과 해석 추세선 변경');
      return commit({ ...copy(state), graph: copy(state.graph ?? DEFAULT_GRAPH), regression: enabled === state.regression.enabled ? copy(state.regression) : { enabled } }, '추세선 표시 변경');
    },
    setGraphView(view, context = 'relationship') {
      if (context === 'interpretation') {
        if (!['measured', 'extended'].includes(view)) throw new Error('그래프 보기 범위를 확인하세요.');
        if (view === 'extended' && !trendGeometry(getGraphData(context).regression, true).intercept.length) throw new Error('추세선을 켜고 계산 가능한 x절편을 확인하세요.');
        return commit({ ...copy(state), interpretation: { ...state.interpretation, view } }, '결과 해석 직선 연장 변경');
      }
      if (!state.graph || !['measured', 'extended'].includes(view)) throw new Error('그래프 보기 범위를 확인하세요.');
      if (view === 'extended' && !trendGeometry(state.regression, true).intercept.length) throw new Error('현재 추세선의 x절편을 계산할 수 없어요.');
      return commit({ ...copy(state), graph: { ...state.graph, view } }, '그래프 보기 범위 변경');
    },
    preparePreset(kind) { return presetColumns(kind, state.calculatedColumns); },
    selectAll() { return setSelection(rowsFor().map(s => s.sampleId)); },
    clearSelection() { anchorId = null; return setSelection([]); },
    undo: () => travel(undo, redo, 'before'), redo: () => travel(redo, undo, 'after'),
  };
}
