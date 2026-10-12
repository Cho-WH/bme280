import test from 'node:test';
import assert from 'node:assert/strict';
import { createChartView } from '../ui/chart-view.js';

test('chart uses time gaps rather than old segment IDs; connecting gaps never fills missing values', () => {
  const original = globalThis.Chart;
  let chart;
  globalThis.Chart = class {
    constructor(_canvas, config) { Object.assign(this, config); chart = this; }
    update() {} destroy() {}
  };
  try {
    const view = createChartView({});
    const points = [0, 100, 6100, 6200, 6000].map((ms, i) => ({ receivedAt: ms, monotonicAt: ms,
      segmentId: i, temperatureC: 20 + i, pressureHpa: 1000,
      validity: { temperatureC: i === 3 ? 'out-of-range' : 'valid', pressureHpa: 'valid' } }));
    view.render(points, 6200, { range: 'all' });
    assert.deepEqual(chart.data.datasets[0].data.map(p => p.y), [20, 21, null, 22, null, null, 24]);
    view.render(points, 6200, { range: 'all', connectGaps: true });
    assert.deepEqual(chart.data.datasets[0].data.map(p => p.y), [20, 21, 22, null, null, 24]);
    view.render(points.slice(0, 3), 6200);
    assert.deepEqual(chart.data.datasets[0].data.map(p => p.x), [-6.2, -6.1, -0.1, -0.1]);
    view.dispose();
  } finally { globalThis.Chart = original; }
});
