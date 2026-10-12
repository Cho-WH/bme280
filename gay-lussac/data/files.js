import { createCalculator, columnLabel } from '../analysis/calculations.js';
import { validateExperimentSnapshot } from './import-validation.js';
export { parseExperimentCsv } from './csv-import.js';

const FIELDS = ['sample_id', 'timestamp',
  'temperature_c', 'pressure_hpa', 'temperature_validity', 'pressure_validity'];
const extraFields = c => [`${columnLabel(c)} [${c.id}]`, `${c.id}:validity`, `${c.id}:reason`, `${c.id}:meta`];
const extraValues = (c, result) => [result.value, result.reason ? 'invalid' : 'valid', result.reason ?? '', JSON.stringify({ name: c.name, unit: c.unit })];
const sourceFields = snapshot => [...FIELDS, ...(snapshot.samples.some(s => s.sourceSampleId != null) ? ['source_sample_id'] : [])];
const sourceValues = (s, fields) => [s.sampleId, new Date(s.receivedAt).toISOString(), s.temperatureC, s.pressureHpa,
  s.validity.temperatureC, s.validity.pressureHpa, ...(fields.includes('source_sample_id') ? [s.sourceSampleId ?? s.sampleId] : [])];

export function buildCsv(snapshot) {
  if (!globalThis.Papa) throw new Error('CSV 도구를 불러오지 못했어요.');
  const imported = snapshot.run.importedColumns ?? [], base = sourceFields(snapshot);
  const fields = [...base, ...imported.flatMap(extraFields)];
  const data = snapshot.samples.map(s => [...sourceValues(s, base), ...imported.flatMap(c => extraValues(c, s.importedValues[c.id]))]);
  return '\uFEFF' + globalThis.Papa.unparse({ fields, data }, { newline: '\r\n', escapeFormulae: true });
}

export function analysisExportInfo(snapshot) {
  const work = snapshot.workspace;
  const candidates = new Set(work?.appliedIds ?? snapshot.samples.map(s => s.sampleId));
  const excluded = new Set(work?.exclusions.map(e => e.sampleId) ?? []);
  const rows = snapshot.samples.filter(s => candidates.has(s.sampleId));
  return { candidateCount: rows.length, excludedCount: rows.filter(s => excluded.has(s.sampleId)).length,
    rows: rows.filter(s => !excluded.has(s.sampleId)), columns: work?.calculatedColumns ?? [] };
}

export function buildAnalysisCsv(snapshot, columnIds = snapshot.workspace?.calculatedColumns.map(c => c.id) ?? []) {
  if (!globalThis.Papa) throw new Error('CSV 도구를 불러오지 못했어요.');
  const { rows, columns } = analysisExportInfo(snapshot), selected = new Set(columnIds);
  if (selected.size !== columnIds.length || columnIds.some(id => !columns.some(c => c.id === id)))
    throw new Error('내보낼 계산 열을 다시 선택하세요.');
  const imported = snapshot.run.importedColumns ?? [];
  const output = [...imported, ...columns.filter(c => selected.has(c.id))], calculate = createCalculator(columns, imported);
  // The stable ID disambiguates identically named columns; names and optional units stay readable.
  const base = sourceFields(snapshot), fields = [...base, ...output.flatMap(extraFields)];
  const data = rows.map(s => {
    const values = { ...s.importedValues, ...calculate(s) };
    return [...sourceValues(s, base), ...output.flatMap(c => extraValues(c, values[c.id]))];
  });
  return '\uFEFF' + globalThis.Papa.unparse({ fields, data }, { newline: '\r\n', escapeFormulae: true });
}

export function buildExperimentJson(snapshot) {
  const copy = structuredClone(snapshot);
  // Persist the setting, never a cached fit that may be stale when imported.
  if (copy.workspace) copy.workspace.regression = { enabled: copy.workspace.regression?.enabled === true };
  return JSON.stringify({ format: 'gay-lussac-experiment', version: 1, snapshot: copy }, null, 2);
}

export function parseExperimentJson(text) {
  let file;
  try { file = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch { throw new Error('JSON 파일을 읽지 못했어요. 전체 실험 JSON 파일을 선택하세요.'); }
  if (file?.format !== 'gay-lussac-experiment' || file.version !== 1)
    throw new Error('지원하는 전체 실험 JSON 형식·버전이 아닙니다.');
  return validateExperimentSnapshot(file.snapshot);
}
