import { CONNECTION } from '../program-config.js';

// Shared by live/overview series and analysis lines. Reversed time is never connected.
export function breaksTimeLine(previousAt, at, { connectGaps = false, gapMs = CONNECTION.staleMs } = {}) {
  if (previousAt == null) return false;
  const delta = at - previousAt;
  return delta < 0 || (!connectGaps && delta >= gapMs);
}

// UTC determines continuity and elapsed time; monotonic time positions the live window.
export function timeGraphData(points, now, { range = 'recent', events = [], origin = points[0]?.receivedAt ?? now, connectGaps = false } = {}) {
  const whole = range === 'all';
  const series = ['temperatureC', 'pressureHpa'].map(field => {
    const data = [];
    let previousAt;
    for (const point of points) {
      const x = whole ? (point.receivedAt - origin) / 1000 : (point.monotonicAt - now) / 1000;
      if (breaksTimeLine(previousAt, point.receivedAt, { connectGaps })) data.push({ x, y: null });
      data.push({ x, y: point.validity[field] === 'valid' ? point[field] : null, sampleId: point.sampleId,
        elapsedSeconds: (point.receivedAt - origin) / 1000 });
      previousAt = point.receivedAt;
    }
    return data;
  });
  const markers = events.filter(e => e.source === 'user').flatMap(e => {
    const nearest = points.find(p => p.receivedAt >= e.receivedAt && p.validity.temperatureC === 'valid');
    if (!nearest) return [];
    const x = whole ? (e.receivedAt - origin) / 1000
      : (nearest.monotonicAt - now - (nearest.receivedAt - e.receivedAt)) / 1000;
    return x < -60 && !whole ? [] : [{ x, y: nearest.temperatureC, elapsedSeconds: (e.receivedAt - origin) / 1000 }];
  });
  return { points, origin, whole, series, markers };
}
