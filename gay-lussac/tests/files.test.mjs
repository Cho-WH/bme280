import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildCsv, buildAnalysisCsv, analysisExportInfo, buildExperimentJson, parseExperimentJson } from '../data/files.js';
import { importRun } from '../data/import-run.js';
import { createWorkspace } from '../analysis/workspace.js';
import { PROGRAM } from '../program-config.js';

globalThis.Papa = createRequire(import.meta.url)('../vendor/papaparse-5.7.0.min.js');
const copy = structuredClone, at = 1700000000000;
function fixture() {
  const snapshot = { run: { id: 'original', schemaVersion: 2, runRevision: 9, name: '온도 실험',
    createdAt: at, updatedAt: at, status: 'complete', source: 'device', program: PROGRAM, profile: PROGRAM.profile,
    lastSavedSampleId: 4, lastSavedEventId: 1 },
  samples: Array.from({ length: 5 }, (_, i) => ({ runId: 'original', sampleId: i + 1, receivedAt: at + i * 1000,
    temperatureC: i, pressureHpa: 1000 + i * 3, extraChannels: { humidityPct: 0 },
    validity: { temperatureC: 'valid', pressureHpa: 'valid', humidityPct: 'unsupported' } })),
  events: [{ runId: 'original', eventId: 1, receivedAt: at, type: 'placement', payload: {}, source: 'user' }], workspace: null };
  const store = { getSnapshot: () => copy(snapshot), getState: () => ({ writable: true }), saveWorkspace: w => { snapshot.workspace = copy(w); } };
  const work = createWorkspace({ store });
  work.saveColumn({ id: 'calc-divide', name: '압력/온도, "비율"', unit: null,
    lhs: { kind: 'column', columnId: 'pressureHpa' }, op: '/', rhs: { kind: 'column', columnId: 'temperatureC' } });
  work.setSelection([1, 2, 3]); work.applyScope('selection'); work.exclude([2], '센서 이동');
  work.setGraph({ xColumnId: 'temperatureC', yColumnId: 'pressureHpa', type: 'scatter' });
  work.setTrendEnabled(true); work.setGraphView('extended');
  work.setFilter({ ranges: { sampleId: { min: 3, max: 3 } } }); work.setSelection([3]);
  // A later sample is present in the store, but has not been loaded into the table.
  snapshot.samples.push({ ...copy(snapshot.samples[4]), sampleId: 6 });
  return { snapshot, work };
}

test('analysis CSV follows applied use/exclude, ignoring checks/filter and unloaded rows; invalid calculations keep rows and reasons', () => {
  const { snapshot } = fixture(), before = copy(snapshot);
  const csv = buildAnalysisCsv(snapshot), parsed = Papa.parse(csv.slice(1), { header: true });
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.deepEqual(parsed.data.map(r => r.sample_id), ['1', '3']);
  const valueColumn = parsed.meta.fields[6];
  assert.equal(parsed.data[0][valueColumn], '');
  assert.equal(parsed.data[0]['calc-divide:validity'], 'invalid');
  assert.match(parsed.data[0]['calc-divide:reason'], /0으로/);
  assert.equal(Number(parsed.data[1][valueColumn]), 503);
  assert.deepEqual(analysisExportInfo(snapshot).rows.map(s => s.sampleId), [1, 3]);
  assert.equal(Papa.parse(buildAnalysisCsv(snapshot, []).slice(1)).data[0].length, 6);
  assert.equal(Papa.parse(buildCsv(snapshot).slice(1), { header: true }).data.length, 6);
  assert.throws(() => buildAnalysisCsv(snapshot, ['gone']), /계산 열/);
  assert.deepEqual(snapshot, before);
});

test('time range and frozen reflection survive JSON; invalid evidence is rejected before import', () => {
  const { snapshot, work } = fixture();
  work.applyTimeRange({ startAt: snapshot.samples[0].receivedAt, endAt: snapshot.samples[3].receivedAt });
  work.setGraph({ xColumnId: 'temperatureC', yColumnId: 'calc-divide', type: 'scatter' });
  work.captureReflection(); work.setReflectionAnswers({ observation: '<b>내 관찰</b>', reasoning: '첫 줄\n다음 줄', limitations: '' });
  const evidence = structuredClone(work.getReflectionModel());
  work.setGraph({ xColumnId: 'temperatureC', yColumnId: 'pressureHpa', type: 'scatter' }); work.deleteColumn('calc-divide');
  const restored = parseExperimentJson(buildExperimentJson(snapshot));
  assert.deepEqual(restored.workspace.reflection, work.getState().reflection);
  const reopened = createWorkspace({ store: { getSnapshot: () => restored, getState: () => ({ writable: false }) } });
  assert.deepEqual(reopened.getReflectionModel(), evidence);
  assert.deepEqual(analysisExportInfo(restored).rows.map(s => s.sampleId), [1, 3, 4]);
  const bad = change => { const value = structuredClone(snapshot); change(value.workspace); return () => parseExperimentJson(buildExperimentJson(value)); };
  assert.throws(bad(w => w.analysisRange.endAt -= 1000), /일치하지/);
  assert.throws(bad(w => w.reflection.evidence.appliedIds.push(999)), /자료 ID/);
  assert.throws(bad(w => w.reflection.evidence.exclusions.push({ sampleId: 5, reason: '' })), /제외/);
  assert.throws(bad(w => w.reflection.evidence.graph.xColumnId = 'gone'), /X축/);
  assert.throws(bad(w => w.reflection.evidence.analysisRange.endAt -= 1000), /일치하지/);
  assert.throws(bad(w => w.reflection.answers.reasoning = 'x'.repeat(1201)), /1200/);
  assert.throws(bad(w => w.reflection.evidence.calculatedColumns[0].lhs.columnId = 'gone'), /A와 B/);
  delete snapshot.workspace.reflection; snapshot.workspace.interpretation = { enabled: true, view: 'extended' };
  assert.equal(parseExperimentJson(buildExperimentJson(snapshot)).workspace.reflection.evidence, null);
});

test('JSON round trip preserves full data, pending samples, definitions and view; recomputes enabled trend on opening', () => {
  const { snapshot, work } = fixture(), file = buildExperimentJson(snapshot), restored = parseExperimentJson(file);
  assert.deepEqual(restored.samples, snapshot.samples); assert.deepEqual(restored.events, snapshot.events);
  assert.equal(restored.workspace.calculatedColumns[0].unit, null);
  assert.deepEqual(restored.workspace.selectedIds, [3]);
  assert.deepEqual(restored.workspace.regression, { enabled: true });
  const opened = createWorkspace({ store: { getSnapshot: () => restored, getState: () => ({ writable: false }) } });
  assert.deepEqual(opened.getGraphData(), work.getGraphData());
  assert.equal(opened.getLoadedCount(), 5);
  assert.equal(opened.getState().graph.view, 'extended');
});

test('JSON import rejects unsupported schema, malformed numbers, duplicate IDs and broken workspace references before persistence', async () => {
  const { snapshot } = fixture();
  const changes = [
    s => { s.run.schemaVersion = 99; }, s => { s.samples[0].temperatureC = null; },
    s => { s.samples[1].sampleId = 1; }, s => { s.events[0].runId = 'other'; },
    s => { s.workspace.appliedIds.push(999); }, s => { s.workspace.exclusions[0].sampleId = 999; },
    s => { s.workspace.graph.xColumnId = 'gone'; },
    s => { s.workspace.calculatedColumns[0].rhs = { kind: 'column', columnId: 'calc-divide' }; },
    s => { s.workspace.table.sort.columnId = 'gone'; },
  ];
  let writes = 0;
  for (const change of changes) {
    const bad = copy(snapshot); change(bad);
    assert.throws(() => parseExperimentJson(buildExperimentJson(bad)));
    await assert.rejects(importRun({ repository: { commitBatch() { writes++; } }, snapshot: bad }));
  }
  assert.equal(writes, 0);
  assert.throws(() => parseExperimentJson('{oops'), /JSON/);
  assert.throws(() => parseExperimentJson('{"format":"gay-lussac-experiment","version":99}'), /버전/);
});

test('JSON collision imports under a new run ID, atomically preserving original records and incomplete status', async () => {
  const { snapshot } = fixture(); snapshot.run.status = 'paused';
  const before = copy(snapshot); let batch;
  const repository = { readRun: async () => snapshot.run, commitBatch: async b => { batch = copy(b); } };
  assert.equal(await importRun({ repository, snapshot, newId: () => 'new-id', now: () => at }), 'new-id');
  assert.equal(batch.insertOnly, true); assert.equal(batch.baseRunRevision, 0);
  assert.equal(batch.run.status, 'paused'); assert.equal(batch.run.source, 'import');
  assert.equal(batch.run.importedFrom.runId, 'original');
  assert.equal(batch.run.lastSavedSampleId, 6);
  assert.equal(batch.workspace.runId, 'new-id');
  assert.ok([...batch.samples, ...batch.events].every(r => r.runId === 'new-id'));
  assert.deepEqual(batch.workspace.appliedIds, snapshot.workspace.appliedIds);
  assert.deepEqual(snapshot, before);
  repository.commitBatch = async () => { throw new Error('quota'); };
  await assert.rejects(importRun({ repository, snapshot }), /quota/);
});

test('fresh JSON import keeps source ID and no-workspace recordings remain valid', async () => {
  const { snapshot } = fixture(); snapshot.workspace = null; let batch;
  assert.equal(await importRun({ repository: { readRun: async () => undefined, commitBatch: async b => { batch = b; } }, snapshot }), 'original');
  assert.equal(batch.workspace, null);
  assert.deepEqual(parseExperimentJson(buildExperimentJson(snapshot)).samples, snapshot.samples);
});

test('version 2 preserves exceptional and absent fields, irregular times, and independent raw records; version 1 still reads', () => {
  const { snapshot } = fixture();
  snapshot.samples[1].temperatureC = null;
  snapshot.samples[1].validity.temperatureC = 'missing';
  snapshot.samples[2].temperatureC = -140.123456789;
  snapshot.samples[2].validity.temperatureC = 'out-of-range';
  snapshot.samples[2].receivedAt = snapshot.samples[0].receivedAt - 37;
  snapshot.samples[2].extraChannels.humidityPct = 17.625;
  snapshot.samples[3].sourceSampleId = 91;
  delete snapshot.samples[3].extraChannels;
  snapshot.samples[4].extraChannels = null;
  const before = copy(snapshot), text = buildExperimentJson(snapshot), file = JSON.parse(text);
  const legacy = JSON.stringify({ format: 'gay-lussac-experiment', version: 1, snapshot }, null, 2);
  const restored = parseExperimentJson(text);
  assert.equal(file.version, 2);
  assert.ok(!text.includes('\n'));
  assert.deepEqual(restored.samples, snapshot.samples);
  assert.deepEqual(restored, parseExperimentJson('\uFEFF' + legacy));
  assert.deepEqual(snapshot, before, 'export must not mutate the live snapshot');
  restored.samples[0].validity.temperatureC = 'missing';
  assert.equal(restored.samples[5].validity.temperatureC, 'valid', 'shared file defaults must become independent records');
  snapshot.samples = []; snapshot.events = []; snapshot.workspace = null;
  snapshot.run.lastSavedSampleId = snapshot.run.lastSavedEventId = 0;
  assert.deepEqual(parseExperimentJson(buildExperimentJson(snapshot)), snapshot);
});

test('compact JSON rejects malformed rows, ambiguous overrides, unsafe properties and excessive expansion', () => {
  const { snapshot } = fixture(), file = JSON.parse(buildExperimentJson(snapshot));
  const changes = [
    p => { p.columns[0] = 'receivedAt'; },
    p => { p.defaults.temperatureC = 25; },
    p => { p.rows[0].pop(); },
    p => { p.rows[0] = null; },
    p => { p.overrides = [[-1, {}, []]]; },
    p => { p.overrides = [[p.rows.length, {}, []]]; },
    p => { p.overrides = [[1, {}, []], [1, {}, []]]; },
    p => { p.overrides = [[2, {}, []], [1, {}, []]]; },
    p => { p.overrides = [[0, { sampleId: 5 }, []]]; },
    p => { p.overrides = [[0, {}, ['temperatureC']]]; },
    p => { p.overrides = [[0, { runId: 'x' }, ['runId']]]; },
    p => { p.overrides = [[0, {}, ['runId', 'runId']]]; },
    p => { p.overrides = [[0, null, []]]; },
    p => { p.defaults.validity = JSON.parse('{"__proto__":{"bad":true}}'); },
  ];
  for (const change of changes) {
    const bad = copy(file); change(bad.snapshot.samples);
    assert.throws(() => parseExperimentJson(JSON.stringify(bad)), /실험 파일/);
  }
  const huge = copy(file);
  huge.snapshot.samples.defaults.note = 'x'.repeat(500_000);
  huge.snapshot.samples.rows = Array.from({ length: 120 }, (_, i) => [i + 1, at, 25, 1000]);
  assert.throws(() => parseExperimentJson(JSON.stringify(huge)), /복원할 자료가 너무 큽니다/);
});

test('8000 measurements export compactly and restore all timestamps and exceptions without loss', () => {
  const { snapshot } = fixture(); snapshot.workspace = null;
  snapshot.run.id = '11111111-2222-4333-8444-555555555555';
  snapshot.samples = Array.from({ length: 8000 }, (_, i) => ({
    runId: snapshot.run.id, sampleId: i + 1, receivedAt: at + i * 200 + i % 7,
    temperatureC: Math.round((25 + 10 * Math.sin(i / 2000)) * 100) / 100,
    pressureHpa: Math.round((1000 + 30 * Math.sin(i / 2000)) * 100) / 100,
    extraChannels: { humidityPct: 0 },
    validity: { temperatureC: 'valid', pressureHpa: 'valid', humidityPct: 'unsupported' },
  }));
  snapshot.samples[123].validity.temperatureC = 'out-of-range';
  snapshot.samples[123].temperatureC = -140.123456789;
  snapshot.samples[0].validity.temperatureC = 'missing';
  snapshot.samples[0].temperatureC = null;
  snapshot.samples[124].receivedAt = snapshot.samples[123].receivedAt;
  snapshot.events.forEach(e => { e.runId = snapshot.run.id; });
  snapshot.run.lastSavedSampleId = 7999;
  const oldFile = JSON.stringify({ format: 'gay-lussac-experiment', version: 1, snapshot }, null, 2);
  const newFile = buildExperimentJson(snapshot);
  assert.equal(JSON.parse(newFile).snapshot.samples.defaults.validity.temperatureC, 'valid');
  assert.ok(Buffer.byteLength(newFile) < Buffer.byteLength(oldFile) * 0.15, 'normal records with an exception should shrink by at least 85%');
  assert.deepEqual(parseExperimentJson(newFile), parseExperimentJson(oldFile));
});
