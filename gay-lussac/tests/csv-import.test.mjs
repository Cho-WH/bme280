import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parseExperimentCsv, buildCsv, buildAnalysisCsv, buildExperimentJson, parseExperimentJson } from '../data/files.js';
import { createWorkspace } from '../analysis/workspace.js';
import { tableColumns } from '../ui/table-columns.js';
import { importRun } from '../data/import-run.js';

globalThis.Papa = createRequire(import.meta.url)('../vendor/papaparse-5.7.0.min.js');
const options = { id: 'csv-test', now: 1700000000000, filename: '온도 실험.csv' };
const legacy = '\uFEFFpressure_hpa,humidity_pct,timestamp,temperature_c\r\n1000,0,2026-10-12T10:00:02Z,0\r\n1.003e3,,2026-10-12T10:00:02Z,\r\n1006,50,2026-10-12T10:00:01Z,2';
function open(snapshot) {
  return createWorkspace({ store: { getSnapshot: () => structuredClone(snapshot), getState: () => ({ writable: true }),
    saveWorkspace: w => { snapshot.workspace = structuredClone(w); } } });
}
const formula = (name = '습도 두 배 (참고)') => ({ id: 'calc-double', name, unit: null,
  lhs: { kind: 'column', columnId: 'data-humidity' }, op: '*', rhs: { kind: 'constant', value: 2 } });

test('legacy CSV preserves file order, repeated/backwards timestamps, humidity, zero and missing values', () => {
  const s = parseExperimentCsv(legacy, options);
  assert.deepEqual(s.samples.map(r => r.sampleId), [1, 2, 3]);
  assert.equal(s.samples[0].receivedAt, s.samples[1].receivedAt);
  assert.ok(s.samples[2].receivedAt < s.samples[1].receivedAt);
  assert.equal(s.samples[0].temperatureC, 0); assert.equal(s.samples[1].temperatureC, null);
  assert.equal(s.samples[1].validity.temperatureC, 'missing');
  assert.equal(s.samples[1].pressureHpa, 1003);
  assert.deepEqual(s.samples[0].importedValues['data-humidity'], { value: 0, reason: null });
  assert.equal(s.samples[1].importedValues['data-humidity'].value, null);
  assert.equal(s.run.source, 'import'); assert.equal(s.run.name, '온도 실험');
  assert.deepEqual(s.events, []); assert.equal(s.workspace, null);
  const range = parseExperimentCsv(legacy.replace('1000,0,', '1200,0,').replace('Z,0', 'Z,-50'), options);
  assert.deepEqual(range.samples[0].validity, { temperatureC: 'out-of-range', pressureHpa: 'out-of-range' });
});

test('raw and analysis CSV round trips preserve fixed columns and sparse source IDs without inventing formulas or exclusions', () => {
  const source = parseExperimentCsv(legacy, options), w = open(source);
  w.saveColumn(formula('=습도, "두 배" (참고)')); w.exclude([2], '검증');
  const before = structuredClone(source), s = parseExperimentCsv(buildAnalysisCsv(source), options);
  assert.deepEqual(s.samples.map(r => r.sampleId), [1, 2]);
  assert.deepEqual(s.samples.map(r => r.sourceSampleId), [1, 3]);
  assert.deepEqual(s.run.importedColumns.map(c => [c.id, c.name, c.unit]), [
    ['data-humidity', '습도', '%'], ['data-calc-double', '=습도, "두 배" (참고)', null],
  ]);
  assert.equal(s.samples[1].importedValues['data-calc-double'].value, 100);
  assert.equal(s.workspace, null);
  assert.deepEqual(open(s).getState().exclusions, []);
  const again = parseExperimentCsv(buildCsv(s), options);
  assert.deepEqual(again.samples, s.samples); assert.deepEqual(again.run.importedColumns, s.run.importedColumns);
  assert.deepEqual(source, before);
  w.restore([2]);
  const missing = parseExperimentCsv(buildAnalysisCsv(source), options).samples[1].importedValues['data-calc-double'];
  assert.equal(missing.value, null); assert.match(missing.reason, /값이 없습니다/);
});

test('earlier analysis exports without metadata remain readable, including units and calculation failure reasons', () => {
  const s = parseExperimentCsv(legacy, options), w = open(s); w.saveColumn({ ...formula(), name: '습도 두 배', unit: '%' });
  const rows = Papa.parse(buildAnalysisCsv(s).slice(1)).data;
  const keep = rows[0].map((h, i) => h.endsWith(':meta') ? -1 : i).filter(i => i >= 0);
  const imported = parseExperimentCsv(Papa.unparse(rows.map(row => keep.map(i => row[i]))), options);
  assert.deepEqual(imported.run.importedColumns[1], { id: 'data-calc-double', name: '습도 두 배', unit: '%' });
  assert.equal(imported.samples[1].importedValues['data-calc-double'].value, null);
});

test('imported columns share filters, sort, calculations, graph, undo and JSON restore while source stays immutable', () => {
  const s = parseExperimentCsv(legacy, options), source = structuredClone(s.samples), w = open(s);
  w.saveColumn(formula());
  w.setSort('data-humidity'); w.setFilter({ ranges: { 'data-humidity': { min: 10 } } });
  assert.deepEqual(w.getRows().map(r => r.sampleId), [3]);
  w.setGraph({ xColumnId: 'data-humidity', yColumnId: 'calc-double', type: 'scatter' }); w.setTrendEnabled(true);
  assert.equal(w.getGraphData().points.length, 2); // table filter does not reduce analysis
  assert.equal(w.getState().regression.result.slope, 2);
  w.exclude([3]); assert.equal(w.getGraphData().points.length, 1);
  w.undo(); assert.equal(w.getGraphData().points.length, 2);
  w.redo(); w.restore([3]);
  const full = tableColumns(w.getState().calculatedColumns, null, w.getImportedColumns());
  const extra = full.filter(c => c.imported || c.editable);
  assert.deepEqual(extra.map(c => c.id), ['data-humidity', 'calc-double']);
  assert.equal(extra[0].editable, undefined);
  const compact = tableColumns(w.getState().calculatedColumns, ['data-humidity', 'calc-double'], w.getImportedColumns());
  assert.equal(compact.find(c => c.id === 'data-humidity').width, extra[0].width);
  const restored = parseExperimentJson(buildExperimentJson(s)), reopened = open(restored);
  assert.deepEqual(reopened.getGraphData(), w.getGraphData());
  assert.deepEqual(reopened.getRows(), w.getRows());
  assert.deepEqual(s.samples, source);
  restored.workspace.graph.xColumnId = 'data-gone';
  assert.throws(() => parseExperimentJson(buildExperimentJson(restored)));
});

test('malformed CSV fails as a whole with row diagnostics; invalid imported JSON cannot reach persistence', async () => {
  const header = 'sample_id,timestamp,temperature_c,pressure_hpa,temperature_validity,pressure_validity';
  const row = '8,2026-10-12T10:00:00Z,20,1000,valid,valid';
  const cases = [
    legacy.replace('1000,0,', 'oops,0,'), legacy.replace('1000,0,', 'Infinity,0,'),
    legacy.replace('1000,0,', '0xff,0,'), legacy.replace('10:00:02Z', '10:00:02'),
    legacy.replace('2026-10-12', '2026-02-30'), legacy.replace('1000,0,', '1000,'),
    legacy.replace('humidity_pct', 'pressure_hpa'), legacy.replace('humidity_pct', 'other'),
    `${header}\n${row}\n${row}`, `${header}\n${row.replace(',20,', ',,')}`,
    `${header}\n${row.replace('8,', '0,')}`, `${header}\n${row.replace('1000', '1e400')}`,
  ];
  for (const csv of cases) assert.throws(() => parseExperimentCsv(csv, options), /CSV/);
  const s = parseExperimentCsv(legacy, options); open(s).saveColumn(formula());
  const records = Papa.parse(buildAnalysisCsv(s).slice(1)).data;
  records[2][records[0].indexOf('calc-double:meta')] = JSON.stringify({ name: '다른 열', unit: null });
  assert.throws(() => parseExperimentCsv(Papa.unparse(records), options), /자료 2행.*행마다/);
  s.samples[0].importedValues['data-humidity'].value = null;
  let writes = 0;
  await assert.rejects(importRun({ repository: { commitBatch() { writes++; } }, snapshot: s }));
  assert.equal(writes, 0);
});
