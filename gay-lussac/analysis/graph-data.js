import { graphColumns } from '../data/contracts.js';
import { columnLabel } from './calculations.js';
import { breaksTimeLine } from './time-series.js';
import { scopeMembership } from './scope.js';

function value(sample, id) {
  if (id === 'receivedAt') return Number.isFinite(sample.receivedAt) ? sample.receivedAt : null;
  if (sample.calculations && Object.hasOwn(sample.calculations, id)) return sample.calculations[id].value;
  if (sample.importedValues && Object.hasOwn(sample.importedValues, id)) return sample.importedValues[id].value;
  return sample.validity?.[id] === 'valid' && Number.isFinite(sample[id]) ? sample[id] : null;
}

// Uses analysis candidates, never the table's filter, sort or transient checks.
export function graphData(samples, state, imported = []) {
  if (!state.graph) return null;
  const graph = state.graph, columns = graphColumns(state.calculatedColumns, imported);
  const { candidates, excluded } = scopeMembership(state);
  const points = [], excludedPoints = [], line = [];
  let invalidCount = 0, candidateCount = 0, excludedCount = 0, previous = null;
  for (const sample of samples) {
    if (sample.sampleId > state.tableLastSampleId || !candidates.has(sample.sampleId)) continue;
    candidateCount++; if (excluded.has(sample.sampleId)) excludedCount++;
    const x = value(sample, graph.xColumnId), y = value(sample, graph.yColumnId);
    const point = { x, y, sampleId: sample.sampleId };
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (!excluded.has(sample.sampleId)) invalidCount++;
      line.push({ x: previous?.x ?? 0, y: null }); previous = null; continue;
    }
    if (excluded.has(sample.sampleId)) {
      excludedPoints.push(point); line.push({ x, y: null }); previous = null; continue;
    }
    if (breaksTimeLine(previous?.receivedAt, sample.receivedAt, { connectGaps: graph.connectGaps })) line.push({ x, y: null });
    points.push(point); line.push(point); previous = { x, receivedAt: sample.receivedAt };
  }
  return { ...graph, points, excludedPoints, line, invalidCount, candidateCount, excludedCount, includedCount: candidateCount - excludedCount,
    xUnit: graph.xColumnId === 'receivedAt' ? '초' : columns.find(c => c.id === graph.xColumnId)?.unit,
    yUnit: columns.find(c => c.id === graph.yColumnId)?.unit,
    xLabel: columnLabel(columns.find(c => c.id === graph.xColumnId)),
    yLabel: columnLabel(columns.find(c => c.id === graph.yColumnId)) };
}
