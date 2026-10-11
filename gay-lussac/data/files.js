const FIELDS = ['sample_id', 'segment_id', 'segment_elapsed_ms', 'time_basis', 'timestamp',
  'temperature_c', 'pressure_hpa', 'temperature_validity', 'pressure_validity'];

export function buildCsv(snapshot) {
  if (!globalThis.Papa) throw new Error('CSV 도구를 불러오지 못했어요.');
  const segments = new Map(snapshot.run.segments.map((s) => [s.id, s]));
  const data = snapshot.samples.map((s) => [s.sampleId, s.segmentId, s.segmentElapsedMs,
    segments.get(s.segmentId)?.timeBasis ?? '', new Date(s.receivedAt).toISOString(),
    s.temperatureC, s.pressureHpa, s.validity.temperatureC, s.validity.pressureHpa]);
  return '\uFEFF' + globalThis.Papa.unparse({ fields: FIELDS, data }, { newline: '\r\n', escapeFormulae: true });
}
