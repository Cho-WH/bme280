import { isValidReading } from '../data/contracts.js';

export const initialReception = () => ({ firstAt: null, lastAt: null, count: 0, attemptId: null });

// Pure rule: neither a timer nor a UI owns the decision to confirm fresh reception.
export function step(previous, input, now, config) {
  let next = { ...previous };
  const expired = next.lastAt !== null && (now - next.lastAt >= config.staleMs || now < next.lastAt);
  if (expired || input?.type === 'reset' || input?.type === 'parse-error'
    || (input?.type === 'reading' && !isValidReading(input))
    || (input?.attemptId != null && input.attemptId !== next.attemptId)) {
    next = initialReception();
  }
  if (isValidReading(input)) {
    next.attemptId = input.attemptId;
    next.firstAt ??= input.monotonicAt;
    next.lastAt = input.monotonicAt;
    next.count += 1;
  }
  const ready = next.count >= config.confirmationCount && next.lastAt - next.firstAt >= config.confirmationSpanMs;
  return { nextState: next, observation: {
    state: next.count ? 'receiving' : previous.count || expired ? 'stale' : 'waiting',
    ready, count: next.count, spanMs: next.count ? next.lastAt - next.firstAt : 0,
  } };
}
