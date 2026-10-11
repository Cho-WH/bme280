export function discontinuityReason(previous, input, gapMs) {
  if (!previous) return null;
  if (previous.attemptId !== input.attemptId) return 'reconnected';
  const monoDelta = input.monotonicAt - previous.monotonicAt;
  const utcDelta = input.receivedAt - previous.receivedAt;
  if (monoDelta < 0 || utcDelta < 0 || Math.abs(utcDelta - monoDelta) >= gapMs) return 'clock-change';
  return monoDelta >= gapMs ? 'reception-gap' : null;
}
