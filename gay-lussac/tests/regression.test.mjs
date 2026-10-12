import test from 'node:test';
import assert from 'node:assert/strict';
import { linearFit, predict, fitGraph, trendGeometry } from '../analysis/regression.js';

const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
test('ordinary least squares returns known coefficients, R² and intercept without changing samples', () => {
  const points = [2, 4, 5, 4, 5].map((y, i) => ({ x: i + 1, y })), original = structuredClone(points);
  const f = linearFit(points);
  near(f.slope, .6); near(f.intercept, 2.2); near(f.rSquared, .6); near(f.xIntercept, -11 / 3);
  assert.equal(f.count, 5); assert.equal(f.reason, null); assert.deepEqual(points, original);
});
test('constant Y retains its horizontal line, while constant X and insufficient data cannot fit', () => {
  const f = linearFit([{ x: 1, y: 7 }, { x: 2, y: 7 }, { x: 3, y: 7 }]);
  assert.equal(f.slope, 0); assert.equal(f.intercept, 7); assert.equal(f.rSquared, null);
  assert.equal(f.rSquaredReason, 'constant-y'); assert.equal(f.xInterceptReason, 'zero-slope');
  assert.equal(linearFit([{ x: 2, y: 1 }, { x: 2, y: 2 }]).reason, 'constant-x');
  const bad = linearFit([{ x: 1, y: 2 }, { x: NaN, y: 3 }, { x: 2, y: Infinity }]);
  assert.equal(bad.reason, 'insufficient-points'); assert.equal(bad.count, 1);
});
test('large offsets and tiny units preserve slopes and predictions without squared-coordinate cancellation', () => {
  const points = Array.from({ length: 100 }, (_, i) => ({ x: 1700000000000 + i * .125, y: 1000 + i * .25 }));
  const fit = linearFit(points); near(fit.slope, 2); near(fit.rSquared, 1);
  for (const p of points) near(predict(fit, p.x), p.y);
  const tiny = linearFit([1, 2, 3].map(x => ({ x: x * 1e-9, y: (x + 3) * 1e-29 })));
  near(tiny.slope / 1e-20, 1); near(tiny.xIntercept / 1e-9, -3); assert.equal(tiny.xInterceptReason, null);
  assert.equal(linearFit([{ x: -1e308, y: 1 }, { x: 1e308, y: 2 }]).reason, 'numeric-range');
  assert.equal(linearFit([{ x: 1e200, y: 1e-200 }, { x: 2e200, y: 2e-200 }]).reason, 'numeric-range');
});
test('numerically vanishing covariance suppresses only the extrapolated intercept', () => {
  const fit = linearFit([{ x: -1, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 1 + 1e-15 }]);
  assert.equal(fit.reason, null); assert.equal(fit.xIntercept, null);
  assert.equal(fit.xInterceptReason, 'unstable-intercept'); assert.ok(Number.isFinite(fit.slope));
});
test('extension is dashed only outside measured X bounds and never replaces measured points', () => {
  for (const offset of [273.15, -10, -2]) {
    const model = { xColumnId: 'temperatureC', points: [1, 2, 3].map(x => ({ x, y: 3 * (x + offset) })) };
    const regression = fitGraph(model, 7), geometry = trendGeometry(regression, true);
    near(regression.result.xIntercept, -offset); assert.equal(regression.inputRevision, 7);
    assert.equal(geometry.measured.length, 2); assert.equal(geometry.intercept[0].y, 0);
    assert.equal(geometry.extension.length, offset === -2 ? 0 : 2);
    assert.equal(trendGeometry(regression).extension.length, 0);
    assert.equal(trendGeometry({ ...regression, enabled: false }, true).measured.length, 0);
  }
});
test('time fits express coefficients in elapsed seconds and map lines back to chart timestamps', () => {
  const origin = 1700000000000, model = { xColumnId: 'receivedAt', points: [0, 1, 2].map(t => ({ x: origin + t * 1000, y: 4 + 2 * t })) };
  const regression = fitGraph(model, 1), geometry = trendGeometry(regression, true);
  near(regression.result.slope, 2); near(regression.result.intercept, 4);
  assert.equal(regression.timeOrigin, origin); assert.equal(geometry.intercept[0].x, origin - 2000);
  assert.deepEqual(geometry.measured, [model.points[0], model.points[2]]);
});
