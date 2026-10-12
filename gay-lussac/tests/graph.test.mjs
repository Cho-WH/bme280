import test from 'node:test';
import assert from 'node:assert/strict';
import { graphData } from '../analysis/graph-data.js';
import { tableColumns } from '../ui/table-columns.js';

test('time graph breaks at gaps, reversed time, excluded or invalid rows without fabricating points', () => {
  const samples = [0, 100, 6100, 6200, 6300, 6400, 6000].map((receivedAt, i) => ({ sampleId: i + 1,
    receivedAt, pressureHpa: 1000 + i, validity: { pressureHpa: i === 3 ? 'invalid' : 'valid' } }));
  const state = { graph: { xColumnId: 'receivedAt', yColumnId: 'pressureHpa', type: 'line', connectGaps: false },
    appliedIds: samples.map(p => p.sampleId), tableLastSampleId: 7, exclusions: [{ sampleId: 5 }], calculatedColumns: [] };
  const g = graphData(samples, state);
  assert.deepEqual(g.points.map(p => p.sampleId), [1, 2, 3, 6, 7]);
  assert.deepEqual(g.excludedPoints.map(p => p.sampleId), [5]); assert.equal(g.invalidCount, 1);
  assert.equal(g.line.filter(p => p.y === null).length, 4);
  state.graph.connectGaps = true;
  const connected = graphData(samples, state);
  assert.equal(connected.line.filter(p => p.y === null).length, 3);
  assert.deepEqual(connected.points, g.points);
});

test('compact columns deduplicate axes in axis order without modifying the full table definition', () => {
  const calculated = [{ id: 'calc-k', name: '절대온도', unit: 'K' }];
  assert.deepEqual(tableColumns(calculated, ['calc-k', 'temperatureC']).map(c => c.id), ['sampleId', 'calc-k', 'temperatureC', 'usage']);
  assert.deepEqual(tableColumns(calculated, ['calc-k', 'calc-k']).map(c => c.id), ['sampleId', 'calc-k', 'usage']);
  assert.deepEqual(tableColumns(calculated).map(c => c.id), ['sampleId', 'temperatureC', 'pressureHpa', 'usage', 'receivedAt', 'note', 'calc-k']);
});
