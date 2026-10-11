const CHANNEL = 'gay-lussac-guide';

export function createViewerAdapter(frame, onState) {
  let currentStep, lastRequest, timer, ready = false, started = false;
  let sequence = 0;
  const origin = new URL('../bmp280-wiring/index.html', location.href).origin;
  function request(type, state) {
    clearTimeout(timer);
    lastRequest = String(++sequence);
    frame.contentWindow?.postMessage({ channel: CHANNEL, version: 1, requestId: lastRequest, type, state }, origin);
    timer = setTimeout(() => onState('unavailable'), 5000);
  }
  function restoreStep() {
    if (ready && currentStep) { onState('loading'); request('apply-state', currentStep.model); }
  }
  function loaded() { ready = false; onState('loading'); request('prepare'); }
  function receive(event) {
    const data = event.data;
    if (event.source !== frame.contentWindow || event.origin !== origin || data?.channel !== CHANNEL
      || data.version !== 1 || data.requestId !== lastRequest) return;
    clearTimeout(timer);
    if (data.type === 'ready') { ready = true; restoreStep(); }
    else if (data.type === 'applied') onState('applied');
    else if (data.type === 'error') { ready = false; onState('unavailable'); }
  }
  frame.addEventListener('load', loaded);
  window.addEventListener('message', receive);
  return {
    applyStep(step) {
      currentStep = step;
      if (!started) {
        started = true;
        frame.src = '../bmp280-wiring/index.html?embed=1';
        onState('loading');
        timer = setTimeout(() => onState('unavailable'), 8000);
      } else if (ready) restoreStep();
      else request('prepare');
    },
    restoreStep() { if (ready) restoreStep(); else loaded(); },
    dispose() { clearTimeout(timer); frame.removeEventListener('load', loaded); window.removeEventListener('message', receive); },
  };
}
