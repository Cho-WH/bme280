// One interpretation of scope/exclusion for the table, charts and file exports.
export function scopeMembership(state, fallbackIds = []) {
  const candidates = new Set(state?.appliedIds ?? fallbackIds);
  const excluded = new Set(state?.exclusions?.map(e => e.sampleId) ?? []);
  return { candidates, excluded,
    status: id => !candidates.has(id) ? 'outside' : excluded.has(id) ? 'excluded' : 'included',
    includes: id => candidates.has(id) && !excluded.has(id) };
}

export const statusLabels = Object.freeze({ included: '분석 포함', excluded: '제외', outside: '범위 밖' });

export function timeBounds(samples) {
  if (!samples.length) return null;
  let startAt = Infinity, endAt = -Infinity;
  for (const s of samples) { startAt = Math.min(startAt, s.receivedAt); endAt = Math.max(endAt, s.receivedAt); }
  return { startAt, endAt, origin: samples[0].receivedAt };
}

export function rangeSampleIds(samples, range) {
  if (!range || ![range.startAt, range.endAt].every(Number.isFinite) || range.startAt > range.endAt)
    throw new Error('시작과 끝 시간을 확인하세요. 시작은 끝보다 늦을 수 없어요.');
  return samples.filter(s => s.receivedAt >= range.startAt && s.receivedAt <= range.endAt).map(s => s.sampleId);
}

export function validateAnalysisRange(range, samples, state) {
  if (range == null) return null;
  const throughSampleId = range.throughSampleId ?? state.tableLastSampleId;
  if (!Number.isSafeInteger(throughSampleId) || throughSampleId < 1 || throughSampleId > state.tableLastSampleId)
    throw new Error('저장된 구간의 자료 경계를 확인하세요.');
  const normalized = { startAt: range.startAt, endAt: range.endAt, throughSampleId };
  const ids = rangeSampleIds(samples.filter(s => s.sampleId <= throughSampleId), normalized);
  const applied = new Set(state.appliedIds);
  if (state.appliedScope !== 'selection' || !ids.length || ids.length !== applied.size || ids.some(id => !applied.has(id)))
    throw new Error('저장된 시간 구간과 분석 자료가 일치하지 않아요.');
  return normalized;
}
