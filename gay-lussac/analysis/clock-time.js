// Display and filtering share the browser-local clock, while raw UTC timestamps stay intact.
export function formatElapsedTime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const rounded = Math.round(seconds), magnitude = Math.abs(rounded);
  return `${rounded < 0 ? '−' : ''}${Math.floor(magnitude / 60)}분 ${magnitude % 60}초`;
}

export function clockTime(timestamp) {
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  return ((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000 + date.getMilliseconds();
}

export function formatClockTime(value) {
  if (value == null || !Number.isFinite(value)) return '';
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(Math.floor(value / 3600000))}:${pad(Math.floor(value / 60000) % 60)}:${pad(Math.floor(value / 1000) % 60)}.${pad(value % 1000, 3)}`;
}

export function parseClockTime(text) {
  if (!text.trim()) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(text.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] ?? 0) > 59)
    throw new Error('시각을 24시간제 시:분:초.밀리초 형식으로 입력하세요.');
  return ((Number(match[1]) * 60 + Number(match[2])) * 60 + Number(match[3] ?? 0)) * 1000
    + Number((match[4] ?? '').padEnd(3, '0'));
}

export function matchesClockTime(timestamp, range) {
  if (!range || (range.min == null && range.max == null)) return true;
  const value = clockTime(timestamp);
  if (value == null) return false;
  // A clock range can cross midnight, e.g. 23:59–00:01.
  if (range.min != null && range.max != null && range.min > range.max) return value >= range.min || value <= range.max;
  return (range.min == null || value >= range.min) && (range.max == null || value <= range.max);
}
