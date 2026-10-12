// Center and scale before summation: timestamps and narrow measurement ranges
// must not lose their variation to subtracting large squared coordinates.
const tolerance = 64 * Number.EPSILON;
function sum(values) {
  let total = 0, correction = 0;
  for (const value of values) {
    const adjusted = value - correction, next = total + adjusted;
    correction = (next - total) - adjusted; total = next;
  }
  return total;
}

export function linearFit(points) {
  const valid = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  const count = valid.length, unavailable = reason => ({ count, reason, slope: null, intercept: null,
    rSquared: null, rSquaredReason: reason, xIntercept: null, xInterceptReason: reason });
  if (count < 2) return unavailable('insufficient-points');
  const originX = valid[0].x, originY = valid[0].y;
  let scaleX = 0, scaleY = 0, minX = originX, maxX = originX;
  for (const p of valid) {
    scaleX = Math.max(scaleX, Math.abs(p.x - originX)); scaleY = Math.max(scaleY, Math.abs(p.y - originY));
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
  }
  if (!scaleX) return unavailable('constant-x');
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) return unavailable('numeric-range');
  const u = valid.map(p => (p.x - originX) / scaleX), v = valid.map(p => (p.y - originY) / (scaleY || 1));
  const meanU = sum(u) / count, meanV = sum(v) / count;
  const xx = sum(u.map(n => (n - meanU) ** 2)), yy = sum(v.map(n => (n - meanV) ** 2));
  const xy = sum(u.map((n, i) => (n - meanU) * (v[i] - meanV)));
  const slope = (scaleY / scaleX) * (xy / xx);
  if (slope === 0 && xy !== 0 && scaleY !== 0) return unavailable('numeric-range');
  const meanDx = scaleX * meanU, meanDy = scaleY * meanV;
  const intercept = (originY + meanDy) - slope * (originX + meanDx);
  if (![slope, intercept, meanDx, meanDy].every(Number.isFinite)) return unavailable('numeric-range');
  const residual = sum(u.map((n, i) => (v[i] - meanV - xy / xx * (n - meanU)) ** 2));
  const rSquared = yy ? Math.max(0, Math.min(1, 1 - residual / yy)) : null;
  const xIntercept = -intercept / slope;
  const xInterceptReason = slope === 0 ? 'zero-slope' : Math.abs(xy) <= tolerance * Math.sqrt(xx * yy)
    ? 'unstable-intercept' : !Number.isFinite(xIntercept) ? 'numeric-range' : null;
  return { count, reason: null, slope, intercept, originX, originY, meanDx, meanDy, minX, maxX,
    rSquared, rSquaredReason: yy ? null : 'constant-y',
    xIntercept: xInterceptReason ? null : xIntercept, xInterceptReason };
}

export function predict(fit, x) {
  return fit.originY + fit.meanDy + fit.slope * ((x - fit.originX) - fit.meanDx);
}

// Time fits use seconds from the first used point, while the chart keeps UTC ms.
export function fitGraph(model, inputRevision) {
  const timeOrigin = model.xColumnId === 'receivedAt' ? model.points[0]?.x ?? 0 : null;
  const points = timeOrigin === null ? model.points : model.points.map(p => ({ x: (p.x - timeOrigin) / 1000, y: p.y }));
  return { enabled: true, inputRevision, timeOrigin, result: linearFit(points) };
}

export function trendGeometry(regression, extended = false) {
  const fit = regression?.enabled && regression.result;
  if (!fit || fit.reason) return { measured: [], extension: [], intercept: [] };
  const toChart = x => regression.timeOrigin === null ? x : regression.timeOrigin + x * 1000;
  const point = x => ({ x: toChart(x), y: predict(fit, x) });
  const measured = [point(fit.minX), point(fit.maxX)], extension = [], intercept = [];
  if (extended && fit.xIntercept !== null) {
    const zero = { x: toChart(fit.xIntercept), y: 0 };
    if (Number.isFinite(zero.x)) {
      if (fit.xIntercept < fit.minX) extension.push(zero, measured[0]);
      else if (fit.xIntercept > fit.maxX) extension.push(measured[1], zero);
      intercept.push(zero);
    }
  }
  return { measured, extension, intercept };
}
