const CHANNEL = 'gay-lussac-guide';

export function createViewerAdapter(frame, onState) {
  let currentStep, lastRequest, timer, ready = false, started = false;
  let sequence = 0;
  let cableSide = 'left', detail = false;
  let hasAppliedState = false;
  const isWiring = () => Boolean(currentStep?.model.wire);
  const notify = state => onState(state, { side: isWiring() ? cableSide : 'left', detail: isWiring() && detail, hasAppliedState });
  const origin = new URL('../bmp280-wiring/index.html', location.href).origin;
  function request(type, state) {
    clearTimeout(timer);
    lastRequest = String(++sequence);
    frame.contentWindow?.postMessage({ channel: CHANNEL, version: 1, requestId: lastRequest, type, state }, origin);
    timer = setTimeout(() => { ready = false; notify('unavailable'); }, 5000);
  }
  function restoreStep() {
    if (ready && currentStep) {
      const state = { ...currentStep.model, side: isWiring() ? cableSide : 'left' };
      if (isWiring() && detail) { state.view = 'connector'; state.explosion = 60; }
      notify('loading'); request('apply-state', state);
    }
  }
  function loaded() { ready = false; hasAppliedState = false; notify('loading'); request('prepare'); }
  function receive(event) {
    const data = event.data;
    if (event.source !== frame.contentWindow || event.origin !== origin || data?.channel !== CHANNEL
      || data.version !== 1 || data.requestId !== lastRequest) return;
    clearTimeout(timer);
    if (data.type === 'ready') { ready = true; restoreStep(); }
    else if (data.type === 'applied') { hasAppliedState = true; notify('applied'); }
    else if (data.type === 'error') { ready = false; notify('unavailable'); }
  }
  frame.addEventListener('load', loaded);
  window.addEventListener('message', receive);
  return {
    applyStep(step) {
      if (currentStep?.id !== step.id) detail = false;
      currentStep = step;
      if (!started) {
        started = true;
        frame.src = '../bmp280-wiring/index.html?embed=1';
        notify('loading');
        timer = setTimeout(() => notify('unavailable'), 8000);
      } else if (ready) restoreStep();
      else request('prepare');
    },
    setCableSide(side) {
      if (!isWiring() || !ready || !['left', 'right'].includes(side) || side === cableSide) return;
      cableSide = side;
      // Connector positions differ: reframe close-ups so both cable ends stay visible.
      if (detail) { restoreStep(); return; }
      // A side-only message preserves the user's camera, wire highlight and separation.
      notify('loading'); request('set-side', { side });
    },
    toggleDetail() {
      if (!isWiring() || !ready) return;
      detail = !detail; restoreStep();
    },
    restoreStep() { detail = false; if (ready) restoreStep(); else loaded(); },
    dispose() { clearTimeout(timer); frame.removeEventListener('load', loaded); window.removeEventListener('message', receive); },
  };
}
