import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace } from '../analysis/workspace.js';

const samples = (count, start = 1) => Array.from({ length: count }, (_, index) => ({ sampleId: start + index,
  receivedAt: 1700000000000 + (start + index) * 100,
  temperatureC: 20 + (start + index) / 10, pressureHpa: 1000 + start + index,
  validity: { temperatureC: 'valid', pressureHpa: 'valid' } }));
function fixture({ snapshot, writable = true } = {}) {
  let data = structuredClone(snapshot ?? { run: { id: 'workspace-test' }, samples: samples(100), workspace: null });
  const saves = [];
  const store = { getSnapshot: () => structuredClone(data), getState: () => ({ writable }),
    saveWorkspace(next) { data.workspace = structuredClone(next); saves.push(structuredClone(next)); } };
  return { store, saves, workspace: createWorkspace({ store }), append(count) { data.samples.push(...samples(count, data.samples.length + 1)); } };
}

const calc = (id, source = 'temperatureC', offset = 273.15) => ({ id: 'calc-' + id, name: id, unit: '',
  lhs: { kind: 'column', columnId: source }, op: '+', rhs: { kind: 'constant', value: offset } });
function applyPreset(workspace, kind) {
  const draft = workspace.preparePreset(kind);
  workspace.saveColumn(draft.at(-1), draft.slice(0, -1));
}

const graphAxes = { xColumnId: 'temperatureC', yColumnId: 'pressureHpa', type: 'scatter' };
test('enabled trend follows scope and use/exclude changes; table operations keep the same fit', () => {
  const f = fixture(), w = f.workspace; w.setGraph(graphAxes); w.setTrendEnabled(true);
  const initial = w.getState().regression;
  w.setSelection([1, 2, 3]); w.setFilter({ ranges: { sampleId: { min: 80 } } }); w.setSort('temperatureC');
  assert.deepEqual(w.getState().regression, initial);
  w.exclude([1, 2]); assert.equal(w.getState().regression.result.count, 98);
  w.setSelection([1, 2, 3]); w.applyScope('selection'); assert.equal(w.getState().regression.result.reason, 'insufficient-points');
  assert.equal(w.getState().regression.enabled, true);
  w.restore([1, 2]); assert.equal(w.getState().regression.result.count, 3); assert.equal(w.getState().regression.result.reason, null);
  assert.equal(w.getState().regression.inputRevision, w.getState().analysisInputRevision);
  const regression = w.getState().regression;
  w.exclude([90]); assert.deepEqual(w.getState().regression, regression);
  assert.equal(w.getGraphData().trend.measured.length, 2);
});
test('new data uses the new snapshot for fitting, while designated scope remains unchanged', () => {
  const f = fixture(), w = f.workspace; w.setGraph(graphAxes); w.setTrendEnabled(true);
  f.append(20); assert.equal(w.getState().regression.result.count, 100);
  w.showNewData(); assert.equal(w.getState().regression.result.count, 120);
  w.setSelection([1, 2, 3]); w.applyScope('selection'); const fit = w.getState().regression;
  f.append(20); w.showNewData(); assert.deepEqual(w.getState().regression, fit);
  w.applyScope('all'); assert.equal(w.getState().regression.result.count, 140);
});
test('trend survives history and reopening; extension resets only when switched off or unavailable', () => {
  const f = fixture(), w = f.workspace; w.setGraph(graphAxes); w.setTrendEnabled(true); w.setGraphView('extended');
  const revision = w.getState().analysisInputRevision;
  w.setGraphView('measured'); assert.equal(w.getState().analysisInputRevision, revision);
  w.undo(); assert.equal(w.getState().graph.view, 'extended');
  w.setTrendEnabled(false); assert.equal(w.getState().graph.view, 'measured'); assert.equal(w.getGraphData().trend.measured.length, 0);
  w.undo(); assert.equal(w.getState().regression.enabled, true); assert.equal(w.getState().graph.view, 'extended');
  const reloaded = fixture({ snapshot: f.store.getSnapshot() }).workspace;
  assert.deepEqual(reloaded.getGraphData(), w.getGraphData());
  w.setSelection([1]); w.applyScope('selection'); assert.equal(w.getState().graph.view, 'measured');
  assert.equal(w.getState().regression.enabled, true); assert.equal(w.getGraphData().trend.measured.length, 0);
  w.undo(); assert.equal(w.getState().graph.view, 'extended'); assert.equal(w.getState().regression.result.count, 100);
  const stale = f.store.getSnapshot(); stale.workspace.regression.result.slope = 999;
  assert.notEqual(fixture({ snapshot: stale }).workspace.getState().regression.result.slope, 999);
});
test('trend follows dependent expressions, ignores unrelated columns and refreshes labels without numeric invalidation', () => {
  const f = fixture(), w = f.workspace;
  w.saveColumn(calc('k')); w.saveColumn(calc('next', 'calc-k', 10));
  w.setGraph({ ...graphAxes, xColumnId: 'calc-next' }); w.setTrendEnabled(true);
  const fit = w.getState().regression;
  w.saveColumn(calc('unrelated')); assert.deepEqual(w.getState().regression, fit);
  w.saveColumn({ ...w.getState().calculatedColumns[1], name: '변경한 이름', unit: 'K' });
  assert.deepEqual(w.getState().regression, fit); assert.equal(w.getGraphData().xLabel, '변경한 이름 (K)');
  w.saveColumn(calc('k', 'temperatureC', 0)); assert.notEqual(w.getState().regression.result.intercept, fit.result.intercept);
  const before = w.getState(); f.store.saveWorkspace = () => { throw new Error('failed'); };
  assert.throws(() => w.setTrendEnabled(false), /failed/); assert.deepEqual(w.getState(), before);
  assert.throws(() => w.exclude([1]), /failed/); assert.deepEqual(w.getState(), before);
  const reader = fixture({ snapshot: f.store.getSnapshot(), writable: false }).workspace;
  assert.throws(() => reader.setTrendEnabled(false), /읽기 전용/);
  assert.throws(() => reader.setGraphView('extended'), /읽기 전용/);
});

test('graph uses applied IDs independently of table filter, sort and checks; excluded points remain restorable', () => {
  const f = fixture(), w = f.workspace;
  w.setSelection([1, 2, 3]); w.applyScope('selection'); w.exclude([2]);
  w.setFilter({ ranges: { sampleId: { min: 50 } } }); w.setSort('temperatureC'); w.setSelection([70]);
  w.setGraph({ xColumnId: 'temperatureC', yColumnId: 'pressureHpa', type: 'scatter' });
  const model = w.getGraphData();
  assert.deepEqual(model.points.map(p => p.sampleId), [1, 3]);
  assert.deepEqual(model.excludedPoints.map(p => p.sampleId), [2]);
  const revision = w.getState().analysisInputRevision;
  w.setSelection([2]); w.setSort('pressureHpa');
  assert.equal(w.getState().analysisInputRevision, revision);
  assert.deepEqual(w.getGraphData(), model);
  w.restore([2]); assert.equal(w.getGraphData().points.length, 3);
  assert.deepEqual(fixture({ snapshot: f.store.getSnapshot() }).workspace.getGraphData(), w.getGraphData());
});

test('graph axes participate in history and deletion guards; display settings do not invalidate inputs', () => {
  const { workspace: w } = fixture(); w.saveColumn(calc('k'));
  const graph = { xColumnId: 'calc-k', yColumnId: 'pressureHpa', type: 'scatter' };
  w.setGraph(graph); assert.throws(() => w.deleteColumn('calc-k'), /그래프 축/);
  const revision = w.getState().analysisInputRevision;
  w.saveColumn({ ...w.getState().calculatedColumns[0], name: '환산 온도', unit: 'K' });
  assert.equal(w.getState().analysisInputRevision, revision); assert.equal(w.getGraphData().xLabel, '환산 온도 (K)');
  w.setGraph({ ...graph, xColumnId: 'receivedAt', type: 'line' });
  const timeRevision = w.getState().analysisInputRevision;
  w.setGraph({ ...w.getState().graph, connectGaps: true });
  assert.equal(w.getState().analysisInputRevision, timeRevision);
  w.undo(); assert.equal(w.getState().graph.connectGaps, false);
  w.undo(); assert.equal(w.getState().graph.xColumnId, 'calc-k');
  w.undo(); w.undo(); assert.equal(w.getState().graph, null);
  w.undo(); assert.equal(w.getState().calculatedColumns.length, 0);
  w.redo(); w.redo(); assert.equal(w.getGraphData().xLabel, 'k');
});

test('invalid axes, read-only graph edits and graph save failures leave state and history intact', () => {
  const f = fixture(), w = f.workspace, before = w.getState();
  const graph = { xColumnId: 'temperatureC', yColumnId: 'pressureHpa', type: 'scatter' };
  assert.throws(() => w.setGraph({ ...graph, xColumnId: 'missing' }), /X축/);
  assert.throws(() => w.setGraph({ ...graph, type: 'line' }), /시간/);
  assert.deepEqual(w.getState(), before);
  const reader = fixture({ snapshot: f.store.getSnapshot(), writable: false }).workspace;
  assert.throws(() => reader.setGraph(graph), /읽기 전용/);
  f.store.saveWorkspace = () => { throw new Error('저장 실패'); };
  assert.throws(() => w.setGraph(graph), /저장 실패/); assert.deepEqual(w.getState(), before);
  assert.equal(w.getSummary().undoLabel, '');
});

test('template preparation and preview do not save; confirmation adds only needed helpers in one undo step', () => {
  const { workspace: w, saves } = fixture();
  const before = w.getState(), saveCount = saves.length, draft = w.preparePreset('ratio');
  const target = draft.at(-1), helpers = draft.slice(0, -1);
  assert.equal(draft.length, 2); assert.ok(draft.every(c => c.unit === null));
  assert.equal(w.previewColumn(target, helpers)[0].value, 1001 / 293.25);
  assert.deepEqual(w.getState(), before); assert.equal(saves.length, saveCount);
  w.saveColumn({ ...target, rhs: { kind: 'constant', value: 2 } }, helpers);
  assert.equal(w.getState().calculatedColumns.length, 1);
  assert.equal(w.getRows()[0].calculations[target.id].value, 500.5);
  w.undo(); assert.equal(w.getState().calculatedColumns.length, 0);
  w.saveColumn(target, helpers);
  assert.deepEqual(w.getState().calculatedColumns.map(c => c.id), draft.map(c => c.id));
  w.undo(); assert.equal(w.getState().calculatedColumns.length, 0);
  w.redo(); assert.equal(w.getState().calculatedColumns.length, 2);
  assert.equal(w.preparePreset('ratio').length, 1);
});

test('calculated columns cover excluded and future rows, persist definitions only, and keep analysis scope', () => {
  const f = fixture(), w = f.workspace, raw = f.store.getSnapshot().samples;
  w.setSelection([1, 2]); w.applyScope('selection'); w.exclude([2]); w.setSelection([1]);
  const before = w.getState(); w.saveColumn(calc('k'));
  assert.deepEqual(w.getState().selectedIds, [1]); assert.deepEqual(w.getState().appliedIds, before.appliedIds);
  assert.equal(w.getRows()[1].calculations['calc-k'].value, 293.34999999999997);
  assert.equal(w.getSummary().includedCount, 1);
  const revision = w.getState().analysisInputRevision;
  w.saveColumn({ ...w.getState().calculatedColumns[0], name: '온도 환산', unit: 'K' });
  assert.equal(w.getState().analysisInputRevision, revision);
  w.saveColumn(calc('next', 'calc-k', 1));
  w.saveColumn(calc('k', 'temperatureC', 10));
  assert.equal(w.getRows()[0].calculations['calc-next'].value, 31.1);
  f.append(2); w.showNewData(); assert.equal(w.getRows().at(-1).calculations['calc-next'].value, 41.2);
  assert.deepEqual(w.getState().appliedIds, before.appliedIds);
  const snapshot = f.store.getSnapshot(); assert.deepEqual(snapshot.samples.slice(0, 100), raw);
  assert.equal('calculations' in snapshot.samples[0], false);
  const reopened = fixture({ snapshot }).workspace;
  assert.deepEqual(reopened.getRows(), w.getRows()); assert.equal(reopened.getState().calculatedColumns[0].unit, null);
});

test('calculated filters, dependency deletion guards and history reconcile removed column references', () => {
  const { workspace: w } = fixture(); applyPreset(w, 'ratio');
  const [k, ratio] = w.getState().calculatedColumns;
  assert.throws(() => w.deleteColumn(k.id), /압력\/절대온도/);
  w.setSort(ratio.id); assert.throws(() => w.deleteColumn(ratio.id), /정렬/);
  w.setSort('sampleId');
  w.setFilter({ ranges: { [k.id]: { min: 300 }, sampleId: { min: 75 } } });
  assert.equal(w.getRows()[0].sampleId, 75);
  assert.throws(() => w.deleteColumn(k.id), /필터/);
  w.undo(); assert.equal(w.getState().calculatedColumns.length, 0);
  assert.deepEqual(w.getState().table.filter.ranges, { sampleId: { min: 75 } });
  w.redo(); assert.equal(w.getState().calculatedColumns.length, 2);
  w.deleteColumn(ratio.id); assert.equal(w.getState().calculatedColumns.length, 1);
  w.undo(); assert.equal(w.getState().calculatedColumns.length, 2);
  w.setFilter({ columnId: ratio.id, ranges: { [ratio.id]: { min: null, max: null } } });
  w.deleteColumn(ratio.id);
  assert.doesNotThrow(() => fixture({ snapshot: { run: { id: 'workspace-test' }, samples: samples(100), workspace: w.getState() } }));
  w.undo();
  w.saveColumn({ ...k, name: '換算', unit: '' }); applyPreset(w, 'ratio');
  assert.equal(w.getState().calculatedColumns.length, 3);
  w.undo(); assert.equal(w.getState().calculatedColumns.length, 2);
});

test('draft previews, invalid edits, read-only commands and failed saves never mutate saved definitions or history', () => {
  const f = fixture(), w = f.workspace; w.saveColumn(calc('k')); w.saveColumn(calc('b', 'calc-k', 1));
  const state = w.getState();
  assert.equal(w.previewColumn(calc('preview'))[0].value, 293.25);
  assert.deepEqual(w.getState(), state);
  assert.throws(() => w.saveColumn(calc('k', 'calc-b')), /순환/);
  assert.deepEqual(w.getState(), state);
  const label = w.getSummary().undoLabel;
  f.store.saveWorkspace = () => { throw new Error('저장 실패'); };
  assert.throws(() => w.saveColumn(calc('c')), /저장 실패/);
  assert.deepEqual(w.getState(), state); assert.equal(w.getSummary().undoLabel, label);
  const reader = fixture({ snapshot: f.store.getSnapshot(), writable: false }).workspace;
  assert.throws(() => reader.saveColumn(calc('c')), /읽기 전용/);
  assert.throws(() => reader.deleteColumn('calc-b'), /읽기 전용/);
  assert.equal(reader.getState().calculatedColumns.length, 2);
  const empty = fixture({ snapshot: { run: { id: 'empty' }, samples: [], workspace: null } }).workspace;
  assert.deepEqual(empty.previewColumn(calc('empty')), []); empty.saveColumn(calc('empty'));
  assert.equal(empty.getState().calculatedColumns.length, 1);
});

test('new rows change only the table boundary; applying replaces candidates and survives reopening', () => {
  const f = fixture(), w = f.workspace;
  w.setSelection(Array.from({ length: 30 }, (_, index) => index + 1)); w.applyScope('selection');
  assert.deepEqual(w.getState().selectedIds, []);
  w.setSelection([1, 2]);
  const input = w.getState().analysisInputRevision, raw = f.store.getSnapshot().samples;
  f.append(20);
  assert.equal(w.getSummary().loadedCount, 100);
  const savedBeforeView = f.store.getSnapshot();
  const notViewed = fixture({ snapshot: savedBeforeView }).workspace;
  notViewed.applyScope('all');
  assert.equal(notViewed.getSummary().candidateCount, 100);
  w.showNewData();
  assert.equal(w.getSummary().loadedCount, 120);
  assert.equal(w.getSummary().candidateCount, 30);
  assert.equal(w.getState().analysisInputRevision, input);
  assert.deepEqual(w.getState().selectedIds, [1, 2]);
  const restored = fixture({ snapshot: f.store.getSnapshot() }); restored.append(10);
  assert.equal(restored.workspace.getSummary().candidateCount, 30);
  assert.equal(restored.workspace.getSummary().loadedCount, 120);
  restored.workspace.applyScope('all');
  assert.equal(restored.workspace.getSummary().candidateCount, 120);
  assert.equal(restored.workspace.getState().analysisInputRevision, input + 1);
  assert.deepEqual(f.store.getSnapshot().samples.slice(0, 100), raw);
});

test('default analysis includes newly loaded readings; invalid raw values remain inspectable', () => {
  const f = fixture({ snapshot: { run: { id: 'workspace-test' }, samples: [], workspace: null } });
  f.append(3); f.workspace.showNewData();
  assert.equal(f.workspace.getSummary().candidateCount, 3);
  f.workspace.applyScope('all');
  const snapshot = f.store.getSnapshot();
  snapshot.samples[0].temperatureC = -100;
  snapshot.samples[0].validity.temperatureC = 'out-of-range';
  const w = fixture({ snapshot }).workspace;
  w.setFilter({ validity: 'invalid' });
  assert.deepEqual(w.getRows().map(s => s.temperatureC), [-100]);
  assert.equal(w.getSummary().candidateCount, 3);
  assert.equal(w.getSummary().invalidCount, 1);
});

test('shift selection follows displayed order, filters clear checks and default analysis ignores the filter', () => {
  const { workspace: w } = fixture();
  w.toggleSelection(2, { checked: true });
  w.toggleSelection(5, { extend: true, checked: true });
  assert.deepEqual(w.getState().selectedIds, [2, 3, 4, 5]);
  w.setSort('temperatureC'); w.setSort('temperatureC');
  w.toggleSelection(99, { checked: true }); w.toggleSelection(97, { extend: true, checked: true });
  assert.deepEqual(w.getState().selectedIds, [2, 3, 4, 5, 97, 98, 99]);
  w.setFilter({ min: 61 });
  assert.equal(w.getSummary().visibleSelectedCount, 0);
  w.selectRange(97, 99);
  w.applyScope('selection'); assert.equal(w.getSummary().candidateCount, 3);
  const input = w.getState().analysisInputRevision;
  w.selectAll();
  assert.equal(w.getState().selectedIds.length, 40);
  assert.equal(w.getState().analysisInputRevision, input);
  w.applyScope('all'); assert.equal(w.getSummary().candidateCount, 100);
});

test('exclusions outside candidates do not invalidate analysis; restore and undo preserve candidate identity', () => {
  const f = fixture(), w = f.workspace;
  w.setSelection([1, 2]); w.applyScope('selection');
  const input = w.getState().analysisInputRevision;
  w.exclude([99], '장치 이동'); assert.equal(w.getState().analysisInputRevision, input);
  w.exclude([1], '가열 전'); assert.equal(w.getState().analysisInputRevision, input + 1);
  assert.equal(w.getSummary().includedCount, 1);
  w.setFilter({ min: 50 });
  assert.deepEqual(w.getState().exclusions.map(e => e.sampleId), [1, 99]);
  w.restore([99]); assert.equal(w.getState().analysisInputRevision, input + 1);
  assert.deepEqual(w.getState().appliedIds, [1, 2]);
  w.undo(); assert.equal(w.getState().analysisInputRevision, input + 1);
  w.undo(); assert.equal(w.getState().analysisInputRevision, input + 2);
  assert.equal(w.getSummary().includedCount, 2);
  w.redo(); assert.equal(w.getState().analysisInputRevision, input + 3);
  assert.deepEqual(w.getState().selectedIds, []);
  assert.equal(w.getState().table.filter.min, 50);
  assert.equal(f.store.getSnapshot().samples.length, 100);
  assert.ok(f.saves.every((state, index) => state.workspaceRevision === index + 1));
});

test('view changes retain input revision and saved snapshots; empty and invalid actions do not change state', () => {
  const f = fixture(), w = f.workspace, firstSave = structuredClone(f.saves[0]);
  w.setSort('pressureHpa'); w.setFilter({ min: 10, max: 15 });
  assert.equal(w.getState().analysisInputRevision, 0);
  const before = w.getState();
  assert.throws(() => w.applyScope('selection'), /선택/);
  assert.throws(() => w.setFilter({ min: 10, max: 1 }), /범위/);
  assert.throws(() => w.setSelection([101]), /새 자료/);
  assert.deepEqual(w.getState(), before); assert.deepEqual(f.saves[0], firstSave);
  const count = f.saves.length; w.setSelection([]);
  assert.equal(f.saves.length, count);
  const restored = fixture({ snapshot: f.store.getSnapshot() }).workspace;
  assert.deepEqual(restored.getRows().map(s => s.sampleId), [10, 11, 12, 13, 14, 15]);
  const legacy = f.store.getSnapshot();
  legacy.workspace.table.scrollTop = 1000;
  const reopened = fixture({ snapshot: legacy });
  assert.equal(reopened.saves.length, 0);
  assert.equal(Object.hasOwn(reopened.workspace.getState().table, 'scrollTop'), false);
  reopened.workspace.setSelection([10]);
  assert.equal(Object.hasOwn(reopened.saves.at(-1).table, 'scrollTop'), false);
});

test('read-only views never initialize or overwrite workspace; failed save leaves the editable state intact', () => {
  const f = fixture({ writable: false });
  assert.equal(f.saves.length, 0);
  assert.throws(() => f.workspace.applyScope('all'), /읽기 전용/);
  assert.throws(() => f.workspace.showNewData(), /읽기 전용/);
  const writer = fixture(), before = writer.workspace.getState();
  writer.store.saveWorkspace = () => { throw new Error('writer closed'); };
  assert.throws(() => writer.workspace.setSelection([1]), /writer closed/);
  assert.deepEqual(writer.workspace.getState(), before);
});

test('students exclude from all data and restore one without reapplying checked rows', () => {
  const f = fixture(), w = f.workspace, raw = f.store.getSnapshot().samples;
  w.setSelection([2, 3, 4]);
  assert.equal(w.getSummary().includedCount, 100);
  assert.equal(w.getSummary().selectedCount, 3);
  w.exclude(w.getState().selectedIds, '가열 전');
  assert.equal(w.getSummary().includedCount, 97);
  assert.deepEqual(w.getState().selectedIds, []);
  w.setFilter({ usage: 'excluded' });
  assert.deepEqual(w.getRows().map(s => s.sampleId), [2, 3, 4]);
  w.toggleSelection(3);
  assert.deepEqual(w.getState().selectedIds, [3]);
  w.restore(w.getState().selectedIds);
  assert.equal(w.getSummary().includedCount, 98);
  assert.deepEqual(w.getState().selectedIds, []);
  const reopened = fixture({ snapshot: f.store.getSnapshot() }).workspace;
  assert.equal(reopened.getSummary().includedCount, 98);
  assert.deepEqual(reopened.getState().selectedIds, []);
  w.undo(); assert.equal(w.getSummary().includedCount, 97);
  w.redo(); assert.equal(w.getSummary().includedCount, 98);
  assert.deepEqual(f.store.getSnapshot().samples, raw);
});

test('a designated scope survives mixed restoration and restoring every excluded row through the filter', () => {
  const f = fixture(), w = f.workspace;
  w.setSelection(samples(20).map(s => s.sampleId)); w.applyScope('selection');
  assert.equal(w.getSummary().includedCount, 20);
  w.setSelection([1, 2, 3]); w.exclude(w.getState().selectedIds, '안정 전');
  assert.equal(w.getSummary().includedCount, 17);
  w.setSelection([2]); w.restore(w.getState().selectedIds);
  assert.equal(w.getSummary().includedCount, 18);
  const input = w.getState().analysisInputRevision;
  w.exclude([99], '범위 밖');
  assert.equal(w.getState().analysisInputRevision, input);
  w.setSelection([1, 99]);
  w.restore(w.getState().selectedIds);
  assert.equal(w.getSummary().includedCount, 19);
  assert.deepEqual(w.getState().appliedIds, samples(20).map(s => s.sampleId));
  w.undo();
  assert.deepEqual(w.getState().exclusions, [{sampleId: 1, reason: '안정 전'}, {sampleId: 3, reason: '안정 전'}, {sampleId: 99, reason: '범위 밖'}]);
  w.setFilter({ usage: 'excluded' }); w.selectAll(); w.restore(w.getState().selectedIds);
  assert.equal(w.getSummary().includedCount, 20);
  assert.equal(w.getState().appliedIds.length, 20);
  assert.deepEqual(w.getState().exclusions, []);
});

test('status filters and ID ranges target only visible rows; designated scope never changes row status', () => {
  const { workspace: w } = fixture();
  w.exclude([1, 3, 5]);
  w.setSelection([1, 2]); w.applyScope('selection');
  w.setSelection([99]); w.setFilter({ usage: 'excluded' });
  assert.deepEqual(w.getState().selectedIds, []);
  assert.deepEqual(w.getRows().map(s => s.sampleId), [1, 3, 5]);
  w.selectRange(2, 5); assert.deepEqual(w.getState().selectedIds, [3, 5]);
  w.selectAll(); assert.deepEqual(w.getState().selectedIds, [1, 3, 5]);
  w.clearSelection(); assert.deepEqual(w.getState().selectedIds, []);
  w.setFilter({ usage: 'included' });
  assert.equal(w.getRows().length, 97);
  w.setSort('sampleId'); w.selectRange(90, 100);
  assert.deepEqual(w.getState().selectedIds, samples(11, 90).map(s => s.sampleId));
  assert.equal(w.getSummary().includedCount, 1);
  const before = w.getState();
  for (const args of [[0, 3], [5, 2], [1.5, 3], [1, 101], [NaN, 3]]) assert.throws(() => w.selectRange(...args), /ID/);
  assert.deepEqual(w.getState(), before);
  w.setFilter({ usage: 'none' }); assert.equal(w.getRows().length, 0);
  assert.deepEqual(w.getState().selectedIds, []);
  w.setFilter({ usage: 'all', min: 90 }); w.selectAll();
  assert.equal(w.getState().selectedIds.length, 11);
  w.applyScope('all'); assert.equal(w.getSummary().includedCount, 97);
  w.setFilter({ usage: 'excluded' }); w.selectAll();
  w.undo(); // Mode change keeps the status filter and its visible checks.
  assert.deepEqual(w.getState().selectedIds, [1, 3, 5]);
  w.undo(); // Reverting the original exclusion must not leave invisible targets.
  w.undo();
  assert.deepEqual(w.getState().selectedIds, []);
});

test('default analysis expands on explicit loading and stays complete through undo; legacy inputs stay designated', () => {
  const f = fixture(), w = f.workspace;
  w.exclude([1]);
  f.append(20); const revision = w.getState().analysisInputRevision;
  assert.equal(w.getSummary().includedCount, 99);
  w.showNewData(); assert.equal(w.getSummary().includedCount, 119);
  assert.equal(w.getState().analysisInputRevision, revision + 1);
  w.undo(); assert.equal(w.getSummary().includedCount, 120);
  w.redo(); assert.equal(w.getSummary().includedCount, 119);
  w.selectRange(2, 10); w.applyScope('selection');
  w.setSelection([99]); assert.equal(w.getSummary().includedCount, 9);
  w.applyScope('all'); assert.equal(w.getSummary().includedCount, 119);
  w.undo(); assert.deepEqual(w.getState().appliedIds, samples(9, 2).map(s => s.sampleId));
  const snapshot = f.store.getSnapshot(); snapshot.workspace.appliedScope = 'all';
  const input = snapshot.workspace.analysisInputRevision;
  const legacy = fixture({ snapshot }).workspace;
  assert.equal(legacy.getState().appliedScope, 'selection');
  assert.equal(legacy.getSummary().includedCount, 9);
  assert.equal(legacy.getState().analysisInputRevision, input);
});

test('commands clear checks in the same saved revision and save failures preserve checks and history', () => {
  const f = fixture(), w = f.workspace;
  w.setSelection([1, 2]);
  const before = w.getState(), count = f.saves.length, save = f.store.saveWorkspace;
  f.store.saveWorkspace = () => { throw new Error('save failed'); };
  assert.throws(() => w.exclude(w.getState().selectedIds), /save failed/);
  assert.deepEqual(w.getState(), before); assert.equal(w.undo(), false);
  f.store.saveWorkspace = save;
  w.exclude(w.getState().selectedIds, '기존 사유');
  assert.equal(f.saves.length, count + 1);
  assert.deepEqual(f.saves.at(-1).selectedIds, []);
  assert.equal(f.saves.at(-1).exclusions.length, 2);
  w.setSelection([1, 3]); w.exclude(w.getState().selectedIds, '새 사유');
  assert.equal(w.getState().exclusions[0].reason, '기존 사유');
  assert.equal(w.getState().exclusions.at(-1).reason, '새 사유');
});

test('column ranges intersect, clear independently and persist without changing analysis input', () => {
  const f = fixture(), w = f.workspace;
  w.setSelection([1]);
  const ranges = { sampleId: { min: 5, max: 30 }, temperatureC: { min: 21, max: 23 }, pressureHpa: { min: 1015, max: 1020 } };
  w.setFilter({ ranges });
  assert.deepEqual(w.getRows().map(s => s.sampleId), [15, 16, 17, 18, 19, 20]);
  assert.deepEqual(w.getState().selectedIds, []);
  assert.equal(w.getState().analysisInputRevision, 0);
  const reopened = fixture({ snapshot: f.store.getSnapshot() }).workspace;
  assert.deepEqual(reopened.getRows(), w.getRows());
  const before = w.getState();
  for (const ranges of [{ temperatureC: { min: 30, max: 20 } }, { pressureHpa: { min: Infinity } }, { missing: { min: 1 } }])
    assert.throws(() => w.setFilter({ ranges }), /범위/);
  assert.deepEqual(w.getState(), before);
  delete ranges.pressureHpa;
  assert.deepEqual(w.getState(), before); // Callers cannot mutate the saved filter by changing their input object.
  w.setFilter({ ranges }); assert.equal(w.getRows().length, 21);
  w.setFilter({ columnId: 'temperatureC', min: 21, max: 23, ranges: { sampleId: { min: 15, max: 20 } } });
  assert.deepEqual(w.getRows().map(s => s.sampleId), [15, 16, 17, 18, 19, 20]);
});

test('validity, reason and timestamp header filters compose', () => {
  const f = fixture(), snapshot = f.store.getSnapshot();
  snapshot.samples[1].validity.temperatureC = 'out-of-range';
  const w = fixture({ snapshot }).workspace;
  w.exclude([1, 2, 70], '가열 전');
  w.setFilter({ validity: 'invalid', reason: '가열', usage: 'excluded' });
  assert.deepEqual(w.getRows().map(s => s.sampleId), [2]);
  w.setFilter({ validity: 'none' }); assert.deepEqual(w.getRows(), []);
  w.setFilter({ ranges: { receivedAt: { min: snapshot.samples[0].receivedAt, max: snapshot.samples[0].receivedAt } } });
  assert.deepEqual(w.getRows().map(s => s.sampleId), [1]);
  assert.equal(w.getSummary().includedCount, 97);
});

test('legacy segment filters and sorting are ignored without losing other filters or analysis IDs', () => {
  const f = fixture(), snapshot = f.store.getSnapshot();
  snapshot.workspace.table = { sort: { columnId: 'segmentId', direction: 'desc' },
    filter: { segmentId: 9, segments: [], columnId: 'segmentId', min: 9, max: 9,
      ranges: { segmentId: { min: 9 }, temperatureC: { min: 29 } }, usage: 'all', validity: 'all' } };
  const restored = fixture({ snapshot }), w = restored.workspace;
  assert.deepEqual(w.getRows().map(s => s.sampleId), samples(11, 90).map(s => s.sampleId));
  assert.equal(w.getSummary().includedCount, 100);
  w.selectAll();
  const saved = restored.saves.at(-1);
  assert.equal(JSON.stringify(saved.table).includes('segment'), false);
  assert.deepEqual(saved.appliedIds, snapshot.workspace.appliedIds);
  assert.deepEqual(restored.store.getSnapshot().samples, snapshot.samples);
});

test('clock-only filters match the table time across dates, retain milliseconds and support midnight', async () => {
  const { clockTime, formatClockTime, parseClockTime } = await import('../analysis/clock-time.js');
  assert.equal(formatClockTime(parseClockTime('07:13:20.1')), '07:13:20.100');
  assert.equal(formatClockTime(parseClockTime('7:13')), '07:13:00.000');
  assert.equal(parseClockTime(''), null);
  for (const value of ['24:00', '07:60', '07:13:60', '2023-11-15T07:13', '07:13:20.1234'])
    assert.throws(() => parseClockTime(value), /시각/);
  const raw = samples(4);
  raw[0].receivedAt = new Date(2026, 9, 12, 7, 13, 20, 100).getTime();
  raw[1].receivedAt = new Date(2026, 9, 13, 7, 13, 20, 100).getTime();
  raw[2].receivedAt = new Date(2026, 9, 12, 23, 59, 59, 999).getTime();
  raw[3].receivedAt = new Date(2026, 9, 13, 0, 0, 0, 1).getTime();
  const f = fixture({ snapshot: { run: { id: 'clock-test' }, samples: raw, workspace: null } }), w = f.workspace;
  const min = clockTime(raw[0].receivedAt);
  w.setFilter({ clockTime: { min, max: min } });
  assert.deepEqual(w.getRows().map(s => s.sampleId), [1, 2]);
  assert.deepEqual(fixture({ snapshot: f.store.getSnapshot() }).workspace.getRows(), w.getRows());
  w.setFilter({ clockTime: { min: parseClockTime('23:59'), max: parseClockTime('00:01') } });
  assert.deepEqual(w.getRows().map(s => s.sampleId), [3, 4]);
  const before = w.getState();
  assert.throws(() => w.setFilter({ clockTime: { min: 86400000 } }), /시각/);
  assert.deepEqual(w.getState(), before);
  assert.equal(w.getSummary().includedCount, 4);
  assert.equal(w.getState().analysisInputRevision, 0);
  assert.deepEqual(f.store.getSnapshot().samples, raw);
});
