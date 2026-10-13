import { SOURCE_COLUMNS, validateCalculatedColumns, validateGraph, validateImportedColumns } from './contracts.js';
import { normalizeFilter } from '../analysis/table-data.js';
import { validateAnalysisRange } from '../analysis/scope.js';
import { validateReflection } from '../analysis/reflection.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const date = value => Number.isFinite(value) && Math.abs(value) <= 8640000000000000;
const string = value => typeof value === 'string' && value.length > 0;
function requireValue(ok, message) { if (!ok) throw new Error('실험 파일: ' + message); }
function checkJson(value, depth = 0) {
  requireValue(depth < 40, '중첩된 자료가 너무 깊습니다.');
  if (typeof value === 'number') requireValue(Number.isFinite(value), '유한하지 않은 숫자가 있습니다.');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    requireValue(!['__proto__', 'prototype', 'constructor'].includes(key), '지원하지 않는 속성이 있습니다.');
    checkJson(child, depth + 1);
  }
}

// Validate before any database write. Raw records keep their values and ordering.
export function validateExperimentSnapshot(input) {
  requireValue(object(input), '실험 내용이 없습니다.'); checkJson(input);
  const snapshot = structuredClone(input), { run, samples, events, workspace: work } = snapshot;
  requireValue(object(run) && run.schemaVersion === 2 && string(run.id) && string(run.name)
    && integer(run.runRevision) && date(run.createdAt) && date(run.updatedAt)
    && ['open', 'paused', 'complete', 'interrupted'].includes(run.status)
    && ['device', 'replay', 'import'].includes(run.source) && object(run.program) && object(run.profile), '실험 정보·버전을 확인하세요.');
  if (run.importedFrom != null) requireValue(object(run.importedFrom) && string(run.importedFrom.runId)
    && ['device', 'replay', 'import'].includes(run.importedFrom.source) && date(run.importedFrom.importedAt), '가져온 실험의 출처 정보가 올바르지 않습니다.');
  requireValue(Array.isArray(samples) && Array.isArray(events), '원자료·사건 목록이 없습니다.');
  const imported = validateImportedColumns(run.importedColumns ?? []), importedIds = new Set(imported.map(c => c.id));
  if (run.importedColumns) run.importedColumns = imported;
  for (const [i, s] of samples.entries()) {
    requireValue(object(s) && s.runId === run.id && s.sampleId === i + 1 && date(s.receivedAt)
      && object(s.validity) && ['temperatureC', 'pressureHpa'].every(id =>
        (Number.isFinite(s[id]) && ['valid', 'out-of-range'].includes(s.validity[id]))
        || (s[id] === null && s.validity[id] === 'missing')), '원자료 ID·숫자·유효성 표시를 확인하세요.');
    if (s.sourceSampleId != null) requireValue(Number.isSafeInteger(s.sourceSampleId) && s.sourceSampleId > 0, '원본 자료 ID를 확인하세요.');
    if (imported.length || s.importedValues != null) {
      requireValue(object(s.importedValues) && Object.keys(s.importedValues).length === imported.length
        && Object.entries(s.importedValues).every(([id, value]) => importedIds.has(id) && object(value)
          && ((Number.isFinite(value.value) && value.reason === null)
            || (value.value === null && string(value.reason)))), '가져온 열의 숫자·빈칸·사유를 확인하세요.');
    }
    if (s.extraChannels != null) requireValue(object(s.extraChannels)
      && Object.values(s.extraChannels).every(Number.isFinite), '추가 채널의 숫자를 확인하세요.');
  }
  for (const [i, e] of events.entries()) requireValue(object(e) && e.runId === run.id && e.eventId === i + 1
    && date(e.receivedAt) && string(e.type) && object(e.payload) && ['user', 'system'].includes(e.source), '사건 ID·시각·내용을 확인하세요.');
  for (const [key, max] of [['lastSavedSampleId', samples.length], ['lastSavedEventId', events.length]])
    requireValue(integer(run[key]) && run[key] <= max, '저장 위치가 원자료·사건 범위를 벗어납니다.');
  if (work == null) { snapshot.workspace = null; return snapshot; }
  requireValue(object(work) && work.runId === run.id && integer(work.workspaceRevision)
    && integer(work.analysisInputRevision) && work.analysisInputRevision <= work.workspaceRevision
    && integer(work.tableLastSampleId) && work.tableLastSampleId <= samples.length
    && ['all', 'selection'].includes(work.appliedScope) && typeof work.note === 'string', '분석 작업 정보가 올바르지 않습니다.');
  const ids = values => Array.isArray(values) && values.every(id => Number.isSafeInteger(id) && id > 0 && id <= work.tableLastSampleId)
    && new Set(values).size === values.length;
  requireValue(ids(work.selectedIds) && ids(work.appliedIds), '선택·분석 대상에 없는 자료 ID가 있습니다.');
  work.analysisRange = validateAnalysisRange(work.analysisRange, samples, work);
  work.reflection = validateReflection(work.reflection, samples, imported);
  delete work.interpretation;
  requireValue(Array.isArray(work.exclusions) && ids(work.exclusions.map(e => e?.sampleId))
    && work.exclusions.every(e => typeof e.reason === 'string' && e.reason.length <= 200), '제외 자료·사유가 올바르지 않습니다.');
  work.calculatedColumns = validateCalculatedColumns(work.calculatedColumns, imported);
  work.graph = validateGraph(work.graph, work.calculatedColumns, imported);
  requireValue(work.regression == null || (object(work.regression) && typeof work.regression.enabled === 'boolean'), '추세선 설정이 올바르지 않습니다.');
  work.regression = { enabled: work.regression?.enabled === true };
  requireValue(!work.regression.enabled || work.graph !== null, '추세선의 그래프가 없습니다.');
  const columnIds = new Set([...SOURCE_COLUMNS, ...imported, ...work.calculatedColumns].map(c => c.id));
  requireValue(object(work.table) && object(work.table.sort) && columnIds.has(work.table.sort.columnId)
    && ['asc', 'desc'].includes(work.table.sort.direction), '표 정렬 설정이 올바르지 않습니다.');
  work.table = { sort: work.table.sort, filter: normalizeFilter(work.table.filter, [...imported, ...work.calculatedColumns]) };
  return snapshot;
}
