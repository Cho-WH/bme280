import { SOURCE_COLUMNS, validateCalculatedColumns, validateGraph } from '../data/contracts.js';
import { normalizeFilter } from './table-data.js';
import { validateAnalysisRange } from './scope.js';
import { validateReflection } from './reflection.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
function requireValue(ok, message) { if (!ok) throw new Error('분석 작업: ' + message); }

// Both local records and imported files pass through the same known migrations.
function migrateWorkspace(value) {
  const work = structuredClone(value);
  if (object(work)) {
    work.calculatedColumns ??= [];
    delete work.interpretation;
    if (object(work.table)) {
      delete work.table.scrollTop;
      if (work.table.sort?.columnId === 'segmentId') work.table.sort = { columnId: 'sampleId', direction: 'asc' };
    }
  }
  return work;
}

export function restoreWorkspace(value, { runId, samples, imported = [] }) {
  const work = migrateWorkspace(value);
  requireValue(object(work) && work.runId === runId && integer(work.workspaceRevision)
    && integer(work.analysisInputRevision) && work.analysisInputRevision <= work.workspaceRevision
    && integer(work.tableLastSampleId) && work.tableLastSampleId <= (samples.at(-1)?.sampleId ?? 0)
    && ['all', 'selection'].includes(work.appliedScope) && typeof work.note === 'string', '분석 작업 정보가 올바르지 않습니다.');
  const ids = values => Array.isArray(values) && values.every(id => Number.isSafeInteger(id) && id > 0 && id <= work.tableLastSampleId)
    && new Set(values).size === values.length;
  requireValue(ids(work.selectedIds) && ids(work.appliedIds), '선택·분석 대상에 없는 자료 ID가 있습니다.');
  work.analysisRange = validateAnalysisRange(work.analysisRange, samples, work);
  work.reflection = validateReflection(work.reflection, samples, imported);
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
  // Older all-mode records sometimes retained a partial candidate set.
  // Preserve those IDs as a designated analysis instead of expanding the scope.
  if (work.appliedScope === 'all') {
    const applied = new Set(work.appliedIds);
    if (samples.some(s => s.sampleId <= work.tableLastSampleId && !applied.has(s.sampleId))) work.appliedScope = 'selection';
  }
  return work;
}
