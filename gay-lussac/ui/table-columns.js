import { TABLE_COLUMNS } from '../analysis/table-data.js';
import { columnLabel } from '../analysis/calculations.js';

const widths = { sampleId: 60, temperatureC: 92, pressureHpa: 100, receivedAt: 106 };
// Header and body consume the same ordered columns in both table layouts.
export function tableColumns(calculated, axisIds = null, imported = []) {
  const source = TABLE_COLUMNS.map(c => ({ ...c, label: columnLabel(c), width: widths[c.id], sortable: true }));
  const extra = [...imported.map(c => ({ ...c, label: columnLabel(c), width: 160, sortable: true, imported: true })),
    ...calculated.map(c => ({ ...c, label: columnLabel(c), width: 160, sortable: true, editable: true }))];
  const usage = { id: 'usage', label: '분석 여부', width: 102 };
  if (axisIds) {
    const byId = new Map([...source, ...extra].map(c => [c.id, c]));
    return [source[0], ...[...new Set(axisIds)].filter(id => byId.has(id)).map(id => byId.get(id)), usage];
  }
  return [...source.slice(0, 3), usage, source[3], { id: 'note', label: '값 확인 · 제외 사유', width: 188 }, ...extra];
}
