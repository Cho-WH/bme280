import { isValidReading } from '../data/contracts.js';
import { CONNECTION } from '../program-config.js';
import { createReceptionMonitor } from './reception-monitor.js';
import { discontinuityReason } from '../diagnostics/continuity.js';
import { validateAdditionalConditions } from './conditions.js';

export function createSession({ store, monitor = createReceptionMonitor(),
  clock = { utc: () => Date.now(), mono: () => performance.now() }, config = CONNECTION }) {
  const initial = store.getSnapshot();
  let state = initial.run.status === 'complete' ? 'ended' : initial.run.status === 'paused' ? 'paused' : 'idle', sampleId = store.getState().lastSampleId;
  let lastInput = null, lastValid = null, finishRequest = null;
  let reception = 'waiting';
  const phaseEvents = initial.events.slice(initial.events.findLastIndex((e) => e.type === 'additional-measurement') + 1);
  let heating = phaseEvents.some((e) => e.type === 'heating-start');
  let placed = phaseEvents.some((e) => e.type === 'placement');
  const accepting = () => state === 'idle' || state === 'collecting';
  const stamp = () => ({ receivedAt: clock.utc(), monotonicAt: clock.mono() });
  function event(type, payload = {}, source = 'system', at = stamp()) {
    return store.appendEvent({ receivedAt: at.receivedAt, type, payload, source });
  }
  function observe(at = stamp()) {
    const observation = monitor.getSnapshot(at.monotonicAt).reception;
    const stopped = lastValid && (at.monotonicAt - lastValid.monotonicAt >= config.staleMs || at.monotonicAt < lastValid.monotonicAt);
    const next = observation.ready ? 'receiving' : stopped || reception !== 'waiting' ? 'stale' : 'waiting';
    if (next !== reception) {
      reception = next;
      event('reception-change', { state: next, ruleId: 'reception', ruleVersion: 1,
        reasonCode: next === 'receiving' ? 'confirmed-readings' : 'no-confirmed-readings',
        evidence: observation, config }, 'system', at);
    }
  }
  function acceptInput(input) {
    if (state === 'paused') { monitor.accept(input, { record: false }); return; }
    if (!accepting()) return;
    const reason = discontinuityReason(lastInput, input, config.staleMs);
    if (reason) event('discontinuity', { reason }, 'system', input);
    monitor.accept(input);
    if (isValidReading(input)) {
      if (state === 'idle') store.updateRun({ status: 'open' });
      lastValid = input; state = 'collecting';
    }
    if (input.type === 'reading') {
      store.appendSample({ sampleId: ++sampleId, receivedAt: input.receivedAt,
        temperatureC: input.temperatureC, pressureHpa: input.pressureHpa,
        extraChannels: input.extraChannels, validity: input.validity });
    } else event('parse-error', { reasonCode: input.reasonCode }, 'system', input);
    observe(input); lastInput = input;
  }
  function tick() {
    if (!accepting()) return;
    const at = stamp();
    observe(at);
  }
  function disconnected() {
    if (state === 'paused') { monitor.disconnected(); return; }
    if (!accepting()) return;
    monitor.disconnected(); observe(); lastInput = null;
  }
  function markEvent(type, payload = {}) {
    if (!accepting() && !(state === 'paused' && ['water-added', 'device-change'].includes(type))) return false;
    if (type === 'heating-start') {
      if (heating || !placed || !monitor.getSnapshot(clock.mono()).reception.ready) return false;
      heating = true;
    }
    if (type === 'placement') { if (placed) return false; placed = true; }
    event(type, payload, 'user'); return true;
  }
  function pause() {
    if (!accepting()) return Promise.resolve();
    state = 'paused';
    event('recording-paused', {}, 'user');
    store.updateRun({ status: 'paused' });
    return store.flush();
  }
  function resetContinuity() {
    lastInput = lastValid = null; reception = 'waiting'; monitor.disconnected();
  }
  function resume() {
    if (state !== 'paused') return false;
    resetContinuity(); state = 'idle';
    event('recording-resumed', {}, 'user'); store.updateRun({ status: 'open' });
    return true;
  }
  function startAdditional(confirmation) {
    if (state !== 'ended') throw new Error('현재 측정을 마친 뒤 추가 측정을 시작해 주세요.');
    if (!store.getState().writable || store.getState().status !== 'clean') throw new Error('기존 자료를 저장하고 작성 권한을 확인해 주세요.');
    const checked = validateAdditionalConditions(confirmation);
    resetContinuity(); placed = heating = false; state = 'idle';
    event('additional-measurement', { ...checked, previousLastSampleId: sampleId }, 'user');
    store.updateRun({ status: 'open' });
  }
  function finish() {
    if (state === 'ended') return Promise.resolve();
    if (finishRequest) return finishRequest;
    if (accepting() || state === 'paused') {
      state = 'finishing'; event('measurement-end', {}, 'user');
      store.updateRun({ status: 'complete' });
    }
    finishRequest = store.flush().then(() => { state = 'ended'; }).finally(() => { finishRequest = null; });
    return finishRequest;
  }
  return { acceptInput, tick, disconnected, markEvent, pause, resume, startAdditional, finish, monitor,
    useTemporary() { if (state === 'finishing') state = 'ended'; },
    getState: () => ({ state, heating, placed, reception, sampleCount: sampleId }),
  };
}
