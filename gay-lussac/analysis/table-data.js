import { matchesClockTime } from './clock-time.js';
import { SOURCE_COLUMNS } from '../data/contracts.js';
import { scopeMembership } from './scope.js';

// Shared table projection. Display order never changes sample identity or analysis inputs.
export const TABLE_COLUMNS = SOURCE_COLUMNS;
export const valueAt = (sample, id) => Object.hasOwn(sample.calculations ?? {}, id) ? sample.calculations[id].value
  : Object.hasOwn(sample.importedValues ?? {}, id) ? sample.importedValues[id].value : sample[id];
export const DEFAULT_FILTER = Object.freeze({ validity: 'all', columnId: 'sampleId', min: null, max: null, usage: 'all' });
export const hasInvalidValue = sample => sample.validity?.temperatureC !== 'valid' || sample.validity?.pressureHpa !== 'valid'
  || Object.values(sample.importedValues ?? {}).some(value => value.reason !== null);
// Keep validation and projection of saved filter definitions together.
export function normalizeFilter(filter, calculatedColumns = []) {
  const columns = [...TABLE_COLUMNS, ...calculatedColumns];
  const f = { ...DEFAULT_FILTER, ...filter };
  // Older workspaces may filter by the removed segment column. Keep other conditions.
  delete f.segmentId; delete f.segments;
  if (f.columnId === 'segmentId') { f.columnId = 'sampleId'; f.min = f.max = null; }
  if (f.ranges && Object.hasOwn(f.ranges, 'segmentId')) {
    f.ranges = { ...f.ranges }; delete f.ranges.segmentId;
  }
  if (!columns.some(c => c.id === f.columnId) || !['all', 'valid', 'invalid', 'none'].includes(f.validity)
    || !['all', 'included', 'excluded', 'none'].includes(f.usage)
    || [f.min, f.max].some(v => v !== null && !Number.isFinite(v))
    || (f.min !== null && f.max !== null && f.min > f.max)) throw new Error('필터의 숫자와 범위를 확인하세요.');
  if (f.ranges != null && (typeof f.ranges !== 'object' || Array.isArray(f.ranges)
    || Object.entries(f.ranges).some(([id, r]) => !columns.some(c => c.id === id) || !r
      || [r.min, r.max].some(v => v != null && !Number.isFinite(v))
      || (r.min != null && r.max != null && r.min > r.max)))) throw new Error('필터의 숫자와 범위를 확인하세요.');
  if (f.reason != null && typeof f.reason !== 'string') throw new Error('제외 사유 필터를 확인하세요.');
  if (f.analysisStatus != null && (!Array.isArray(f.analysisStatus) || f.analysisStatus.some(s => !['included', 'excluded', 'outside'].includes(s))))
    throw new Error('분석 상태 필터를 확인하세요.');
  if (f.clockTime != null && (typeof f.clockTime !== 'object' || Array.isArray(f.clockTime)
    || [f.clockTime.min, f.clockTime.max].some(v => v != null && (!Number.isInteger(v) || v < 0 || v >= 86400000))))
    throw new Error('시각 필터의 시·분·초를 확인하세요.');
  return f;
}

export function columnRanges(filter) {
  return { ...((filter.min != null || filter.max != null)
    ? { [filter.columnId]: { min: filter.min ?? null, max: filter.max ?? null } } : {}), ...filter.ranges };
}
export function columnFilterActive(filter, columnId) {
  if (columnId === 'usage') return (filter.usage ?? 'all') !== 'all' || (filter.analysisStatus != null && filter.analysisStatus.length !== 3);
  if (columnId === 'note') return (filter.validity ?? 'all') !== 'all' || !!filter.reason;
  if (columnId === 'receivedAt' && (filter.clockTime?.min != null || filter.clockTime?.max != null)) return true;
  const range = columnRanges(filter)[columnId];
  return range != null && (range.min != null || range.max != null);
}

export function tableRows(samples, state) {
  const scope = scopeMembership(state);
  const exclusions = new Map(state.exclusions.map(item => [item.sampleId, item.reason]));
  const f = state.table.filter;
  const ranges = Object.entries(columnRanges(f));
  const rows = samples.filter(s => {
    if (s.sampleId > state.tableLastSampleId) return false;
    if (f.analysisStatus && !f.analysisStatus.includes(scope.status(s.sampleId))) return false;
    if (f.usage === 'none' || (f.usage === 'excluded' && !exclusions.has(s.sampleId))
      || (f.usage === 'included' && exclusions.has(s.sampleId))) return false;
    if (f.validity === 'none') return false;
    if (f.validity !== 'all' && hasInvalidValue(s) !== (f.validity === 'invalid')) return false;
    if (f.reason && !(exclusions.get(s.sampleId) ?? '').includes(f.reason)) return false;
    if (!matchesClockTime(s.receivedAt, f.clockTime)) return false;
    return ranges.every(([id, range]) => (range.min == null || (Number.isFinite(valueAt(s, id)) && valueAt(s, id) >= range.min))
      && (range.max == null || (Number.isFinite(valueAt(s, id)) && valueAt(s, id) <= range.max)));
  });
  const { columnId, direction } = state.table.sort;
  return rows.sort((a, b) => {
    const x = valueAt(a, columnId), y = valueAt(b, columnId);
    if (x === null || x === undefined) return y == null ? a.sampleId - b.sampleId : 1;
    if (y === null || y === undefined) return -1;
    return (x - y) * (direction === 'asc' ? 1 : -1) || a.sampleId - b.sampleId;
  });
}

export function analysisScope(samples, state) {
  const { candidates, excluded } = scopeMembership(state);
  const rows = samples.filter(s => candidates.has(s.sampleId));
  const included = rows.filter(s => !excluded.has(s.sampleId));
  return { candidateCount: rows.length, includedCount: included.length, excludedCount: rows.length - included.length,
    invalidCount: included.filter(hasInvalidValue).length };
}
