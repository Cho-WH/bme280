// File-only representation. RunStore and IndexedDB continue using full sample records.
const COLUMNS = ['sampleId', 'receivedAt', 'temperatureC', 'pressureHpa'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const encoder = new TextEncoder();
const bytes = value => encoder.encode(JSON.stringify(value)).byteLength;
const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;
function requireValue(ok) {
  if (!ok) throw new Error('실험 파일: 압축 원자료의 열·행·예외 정보를 확인하세요.');
}

export function packSamples(samples) {
  // Use the most frequent metadata, so an exceptional first reading stays exceptional.
  const fields = new Map();
  for (const sample of samples) for (const [key, value] of Object.entries(sample)) {
    if (COLUMNS.includes(key)) continue;
    if (!fields.has(key)) fields.set(key, { present: 0, values: new Map() });
    const field = fields.get(key), encoded = JSON.stringify(value);
    field.present++;
    const entry = field.values.get(encoded) ?? { value, count: 0 };
    entry.count++; field.values.set(encoded, entry);
  }
  const defaults = Object.fromEntries([...fields].flatMap(([key, field]) => {
    const mostCommon = [...field.values.values()].reduce((best, entry) => entry.count > best.count ? entry : best);
    return mostCommon.count > samples.length - field.present ? [[key, mostCommon.value]] : [];
  }));
  const serialized = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, JSON.stringify(value)]));
  const overrides = [];
  const rows = samples.map((sample, index) => {
    const values = Object.fromEntries(Object.entries(sample).filter(([key, value]) =>
      !COLUMNS.includes(key) && (!own(defaults, key) || JSON.stringify(value) !== serialized[key])));
    const missing = Object.keys(defaults).filter(key => !own(sample, key));
    if (Object.keys(values).length || missing.length) overrides.push([index, values, missing]);
    return COLUMNS.map(key => sample[key]);
  });
  return { columns: [...COLUMNS], defaults, rows, overrides };
}

export function unpackSamples(snapshot) {
  requireValue(object(snapshot) && object(snapshot.samples));
  const packed = snapshot.samples, { columns, defaults, rows, overrides } = packed;
  requireValue(Object.keys(packed).length === 4 && Array.isArray(columns)
    && columns.length === COLUMNS.length && columns.every((key, i) => key === COLUMNS[i])
    && object(defaults) && !COLUMNS.some(key => own(defaults, key))
    && Array.isArray(rows) && Array.isArray(overrides));
  const patches = new Map();
  let previous = -1;
  for (const entry of overrides) {
    requireValue(Array.isArray(entry) && entry.length === 3);
    const [index, values, missing] = entry;
    requireValue(Number.isSafeInteger(index) && index > previous && index < rows.length
      && object(values) && !COLUMNS.some(key => own(values, key))
      && Array.isArray(missing) && new Set(missing).size === missing.length
      && missing.every(key => typeof key === 'string' && own(defaults, key) && !own(values, key)));
    previous = index; patches.set(index, { values, missing });
  }
  // Bound expansion before copying shared nested values into thousands of records.
  const fieldBytes = (key, value) => bytes(key) + 1 + bytes(value) + 1;
  const defaultSizes = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, fieldBytes(key, value)]));
  const baseSize = Object.values(defaultSizes).reduce((sum, size) => sum + size, 0);
  let expandedBytes = bytes({ ...snapshot, samples: [] });
  rows.forEach((row, index) => {
    requireValue(Array.isArray(row) && row.length === COLUMNS.length);
    const patch = patches.get(index);
    let size = 2 + baseSize + row.reduce((sum, value, i) => sum + fieldBytes(COLUMNS[i], value), 0);
    for (const key of patch?.missing ?? []) size -= defaultSizes[key];
    for (const [key, value] of Object.entries(patch?.values ?? {})) size += fieldBytes(key, value) - (defaultSizes[key] ?? 0);
    expandedBytes += size;
    if (expandedBytes > MAX_EXPANDED_BYTES) throw new Error('실험 파일: 복원할 자료가 너무 큽니다. 50MB 이하의 자료로 나누어 주세요.');
  });
  const samples = rows.map((row, index) => {
    const patch = patches.get(index);
    const sample = { ...structuredClone(defaults), ...Object.fromEntries(COLUMNS.map((key, i) => [key, row[i]])),
      ...structuredClone(patch?.values ?? {}) };
    for (const key of patch?.missing ?? []) delete sample[key];
    return sample;
  });
  return { ...snapshot, samples };
}
