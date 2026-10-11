import { initialReception, step } from '../diagnostics/reception.js';
import { CONNECTION } from '../program-config.js';
import { isValidReading } from '../data/contracts.js';
import { discontinuityReason } from '../diagnostics/continuity.js';

// A bounded display cache for connection checks, never the experiment record.
// The session uses this observer while sending all raw inputs to RunStore.
export function createReceptionMonitor(config = CONNECTION) {
  let reception = initialReception();
  let battery = initialReception();
  let batteryAfter = null;
  let latest = null;
  let points = [];
  let segment = 0;
  let lastInput = null;
  let problem = '';
  function accept(input, { record = true } = {}) {
    if (input.type === 'reading') latest = input;
    const discontinuity = discontinuityReason(lastInput, input, config.staleMs);
    if (discontinuity) { reception = initialReception(); battery = initialReception(); }
    if (discontinuity || !isValidReading(input)) ++segment;
    reception = step(reception, input, input.monotonicAt, config).nextState;
    if (batteryAfter !== null && input.monotonicAt > batteryAfter) battery = step(battery, input, input.monotonicAt, config).nextState;
    if (input.type === 'reading' && record) {
      points.push({ ...input, segmentId: segment });
      points = points.filter((point) => input.monotonicAt - point.monotonicAt <= 60000).slice(-6000);
    }
    lastInput = input;
    problem = input.type === 'parse-error' ? '값의 형식을 확인하지 못했어요. 실험 프로그램을 확인해 주세요.'
      : isValidReading(input) ? '' : '센서 범위 밖의 값이에요. 전원과 배선을 확인해 주세요.';
  }
  function disconnected() { reception = initialReception(); battery = initialReception(); ++segment; }
  function confirmBattery(now) { batteryAfter = now; battery = initialReception(); }
  function getSnapshot(now) {
    const observed = step(reception, null, now, config).observation;
    const batteryObserved = step(battery, null, now, config).observation;
    return { reception: observed, battery: { ...batteryObserved, armed: batteryAfter !== null }, latest,
      points: points.filter((point) => now - point.monotonicAt <= 60000), problem };
  }
  return { accept, disconnected, confirmBattery, getSnapshot };
}
