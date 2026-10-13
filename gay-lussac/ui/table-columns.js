import { TABLE_COLUMNS } from '../analysis/table-data.js';
import { columnLabel } from '../analysis/calculations.js';

const widths = { sampleId: 60, receivedAt: 106 };
// Header and body consume the same ordered columns in both table layouts.
export function tableColumns(calculated, axisIds = null, imported = []) {
  const numericWidth = axisIds ? 100 : 124;
  const source = TABLE_COLUMNS.map(c => ({ ...c, label: columnLabel(c), width: ['temperatureC', 'pressureHpa'].includes(c.id) ? numericWidth : c.id === 'sampleId' && !axisIds ? 72 : widths[c.id], sortable: true }));
  const extra = [...imported.map(c => ({ ...c, label: columnLabel(c), width: numericWidth, sortable: true, imported: true })),
    ...calculated.map(c => ({ ...c, label: columnLabel(c), width: numericWidth, sortable: true, editable: true }))];
  const usage = { id: 'usage', label: '분석 여부', width: axisIds ? 102 : 114 };
  if (axisIds) {
    const byId = new Map([...source, ...extra].map(c => [c.id, c]));
    return [source[0], ...[...new Set(axisIds)].filter(id => byId.has(id)).map(id => byId.get(id)), usage];
  }
  return [...source.slice(0, 3), usage, source[3], { id: 'note', label: '값 확인 · 제외 사유', width: 188 }, ...extra];
}
