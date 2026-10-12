import { validateImportedColumns } from './contracts.js';
import { validateExperimentSnapshot } from './import-validation.js';
import { columnLabel } from '../analysis/calculations.js';

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const CORE = ['timestamp', 'temperature_c', 'pressure_hpa'];
const CURRENT = ['sample_id', ...CORE, 'temperature_validity', 'pressure_validity'];
const IGNORED = ['segment_id', 'segment_elapsed_ms'];
const unescapeFormula = text => /^'[=+\-@\t\r]/.test(text) ? text.slice(1) : text;
function fail(message, row) { throw new Error(`CSV${row ? ` 자료 ${row}행` : ''}: ${message}`); }
function number(text, name, row, optional = true) {
  const value = text.trim();
  if (!value && optional) return null;
  if (!NUMBER.test(value) || !Number.isFinite(Number(value))) fail(`${name}에 숫자 또는 빈칸을 사용하세요.`, row);
  return Number(value);
}
function timestamp(text, row) {
  const value = text.trim(), match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) fail('timestamp는 시간대가 있는 ISO 시각이어야 합니다. 예: 2026-10-12T10:00:00.000Z', row);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const zone = match[7], ms = Date.parse(value);
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59
    || (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) || !Number.isFinite(ms)) fail('유효한 날짜와 시각을 입력하세요.', row);
  return ms;
}
const inferredValidity = (value, min, max) => value === null ? 'missing' : value < min || value > max ? 'out-of-range' : 'valid';

// Supported, named schemas only. Do not infer arbitrary spreadsheet columns or drop bad rows.
export function parseExperimentCsv(text, { filename = '가져온 자료.csv', id = crypto.randomUUID(), now = Date.now() } = {}) {
  if (!globalThis.Papa) throw new Error('CSV 도구를 불러오지 못했어요.');
  if (text.includes('\uFFFD')) fail('UTF-8 형식으로 저장한 CSV 파일을 선택하세요.');
  const parsed = globalThis.Papa.parse(text.replace(/^\uFEFF/, ''), { delimiter: ',', skipEmptyLines: true, dynamicTyping: false });
  if (parsed.errors.length) fail('따옴표·쉼표 형식이 올바르지 않습니다. ' + parsed.errors[0].message);
  const [rawHeaders, ...rows] = parsed.data;
  if (!rawHeaders?.length || !rows.length) fail('열 이름과 측정 자료가 필요합니다.');
  const headers = rawHeaders.map(h => h.trim()), indexes = new Map(headers.map((h, i) => [h, i]));
  if (indexes.size !== headers.length || headers.some(h => !h)) fail('빈 열 이름이나 중복된 열 이름이 있습니다.');
  const modern = headers.some(h => ['sample_id', 'temperature_validity', 'pressure_validity'].includes(h));
  const required = modern ? CURRENT : [...CORE, 'humidity_pct'];
  if (required.some(h => !indexes.has(h))) fail('필요한 열: ' + required.join(', '));
  rows.forEach((row, i) => { if (row.length !== headers.length) fail('열 개수가 헤더와 다릅니다.', i + 1); });
  const get = (row, key) => indexes.has(key) ? row[indexes.get(key)] : '';
  const known = new Set([...required, 'source_sample_id', ...IGNORED]);
  const imported = [], descriptors = [];
  if (indexes.has('humidity_pct')) {
    known.add('humidity_pct');
    imported.push({ id: 'data-humidity', name: '습도', unit: '%' });
  }
  for (const header of headers) {
    const match = /^(.*?) \[((?:calc|data)-[\w-]+)\]$/.exec(header);
    if (!match) continue;
    const [, label, sourceId] = match, columnId = sourceId.startsWith('data-') ? sourceId : 'data-' + sourceId;
    const validity = sourceId + ':validity', reason = sourceId + ':reason', meta = sourceId + ':meta';
    if (!indexes.has(validity) || !indexes.has(reason)) fail(`${label} 열의 validity·reason 열이 필요합니다.`);
    let definition;
    if (indexes.has(meta)) {
      try { definition = JSON.parse(get(rows[0], meta)); } catch { fail(`${label} 열의 이름·단위 정보가 올바르지 않습니다.`); }
      if (!definition || typeof definition.name !== 'string' || (definition.unit != null && typeof definition.unit !== 'string')
        || (label !== columnLabel(definition) && unescapeFormula(label) !== columnLabel(definition))) fail(`${label} 열의 이름·단위 정보가 헤더와 다릅니다.`);
      known.add(meta);
    } else {
      // Compatibility with earlier three-column exports, whose final parentheses denoted a unit.
      const clean = unescapeFormula(label), old = /^(.*) \(([^()]*)\)$/.exec(clean);
      definition = { name: old ? old[1] : clean, unit: old ? old[2] : null };
    }
    const column = { id: columnId, name: definition.name, unit: definition.unit ?? null };
    imported.push(column); descriptors.push({ column, header, validity, reason, meta: indexes.has(meta) ? meta : null });
    [header, validity, reason].forEach(key => known.add(key));
  }
  const unsupported = headers.filter(h => !known.has(h));
  if (unsupported.length) fail('지원하지 않는 열: ' + unsupported.join(', '));
  validateImportedColumns(imported);
  const seenIds = new Set();
  const samples = rows.map((row, i) => {
    const ordinal = i + 1, temperatureC = number(get(row, 'temperature_c'), 'temperature_c', ordinal);
    const pressureHpa = number(get(row, 'pressure_hpa'), 'pressure_hpa', ordinal);
    const validity = { temperatureC: inferredValidity(temperatureC, -40, 85), pressureHpa: inferredValidity(pressureHpa, 300, 1100) };
    if (modern) for (const [field, key, value] of [['temperatureC', 'temperature_validity', temperatureC], ['pressureHpa', 'pressure_validity', pressureHpa]]) {
      const flag = get(row, key).trim();
      if (!(value === null ? flag === 'missing' : ['valid', 'out-of-range'].includes(flag))) fail(`${key}와 값이 일치하지 않습니다.`, ordinal);
      validity[field] = flag;
    }
    const sample = { runId: id, sampleId: ordinal, receivedAt: timestamp(get(row, 'timestamp'), ordinal), temperatureC, pressureHpa, validity };
    if (modern) {
      const oldId = number(get(row, 'sample_id'), 'sample_id', ordinal, false);
      if (!Number.isSafeInteger(oldId) || oldId <= 0 || seenIds.has(oldId)) fail('sample_id는 중복 없는 양의 정수여야 합니다.', ordinal);
      seenIds.add(oldId); sample.sourceSampleId = oldId;
    }
    if (indexes.has('source_sample_id')) {
      const source = number(get(row, 'source_sample_id'), 'source_sample_id', ordinal, false);
      if (!Number.isSafeInteger(source) || source <= 0) fail('source_sample_id는 양의 정수여야 합니다.', ordinal);
      sample.sourceSampleId = source;
    }
    if (imported.length) sample.importedValues = {};
    if (indexes.has('humidity_pct')) {
      const value = number(get(row, 'humidity_pct'), 'humidity_pct', ordinal);
      sample.importedValues['data-humidity'] = { value, reason: value === null ? 'CSV에 값이 없습니다.' : null };
    }
    for (const d of descriptors) {
      const value = number(get(row, d.header), d.column.name, ordinal), flag = get(row, d.validity).trim(), reason = unescapeFormula(get(row, d.reason));
      if ((value === null && flag !== 'invalid') || (value !== null && (flag !== 'valid' || reason.trim()))) fail(`${d.column.name}의 값·유효성·사유가 일치하지 않습니다.`, ordinal);
      if (d.meta) {
        let meta; try { meta = JSON.parse(get(row, d.meta)); } catch { fail(`${d.column.name}의 열 정보가 없습니다.`, ordinal); }
        if (meta?.name !== d.column.name || (meta?.unit ?? null) !== d.column.unit) fail(`${d.column.name}의 열 정보가 행마다 다릅니다.`, ordinal);
      }
      sample.importedValues[d.column.id] = { value, reason: value === null ? reason || 'CSV에 값이 없습니다.' : null };
    }
    return sample;
  });
  return validateExperimentSnapshot({ run: { id, schemaVersion: 2, runRevision: 1,
    name: filename.replace(/\.csv$/i, '').slice(0, 100) || '가져온 CSV 자료', createdAt: now, updatedAt: now,
    status: 'complete', source: 'import', program: {}, profile: {}, importedColumns: imported,
    csvImport: { filename, format: modern ? 'gay-lussac-csv' : 'bme280-csv' },
    lastSavedSampleId: samples.length, lastSavedEventId: 0 }, samples, events: [], workspace: null });
}
