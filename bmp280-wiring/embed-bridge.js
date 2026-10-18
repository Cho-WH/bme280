// Deliberately outside the generated 3D bundle. Only known UI actions are exposed.
if (new URLSearchParams(location.search).get('embed') === '1' && window.parent !== window) {
  const channel = 'gay-lussac-guide';
  const views = ['iso', 'front', 'back', 'top', 'ports', 'connector'];
  const wires = [null, 'vcc', 'gnd', 'scl', 'sda'];
  const reply = (requestId, type, extra = {}) => parent.postMessage({ channel, version: 1, requestId, type, ...extra }, location.origin);
  const available = () => document.querySelector('#viewport canvas')
    && document.getElementById('loading').hidden && document.getElementById('error').hidden;
  const sides = ['left', 'right'];
  function setSide(side) {
    const radio = document.querySelector(`[name="side"][value="${side}"]`);
    if (!radio.checked) {
      radio.checked = true;
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== parent || event.origin !== location.origin || !data || data.channel !== channel
      || data.version !== 1 || typeof data.requestId !== 'string' || data.requestId.length > 100) return;
    if (data.type === 'prepare') {
      reply(data.requestId, available() ? 'ready' : 'error', available() ? {} : { reason: 'viewer-unavailable' });
      return;
    }
    if (data.type === 'set-side') {
      if (!sides.includes(data.state?.side)) { reply(data.requestId, 'error', { reason: 'invalid-state' }); return; }
      if (!available()) { reply(data.requestId, 'error', { reason: 'viewer-unavailable' }); return; }
      setSide(data.state.side);
      reply(data.requestId, 'applied'); return;
    }
    if (data.type !== 'apply-state') return;
    const state = data.state;
    if (!state || !views.includes(state.view) || !wires.includes(state.wire)
      || !Number.isInteger(state.explosion) || state.explosion < 0 || state.explosion > 60
      || (state.view === 'connector' && state.explosion !== 60)
      || (state.side !== undefined && !sides.includes(state.side))) {
      reply(data.requestId, 'error', { reason: 'invalid-state' }); return;
    }
    if (!available()) { reply(data.requestId, 'error', { reason: 'viewer-unavailable' }); return; }
    setSide(state.side ?? 'left');
    document.getElementById('all-wires').click();
    if (state.wire !== null) {
      const wire = document.querySelector(`[data-wire="${state.wire}"]`);
      if (wire.getAttribute('aria-pressed') !== 'true') wire.click();
    }
    const explode = document.getElementById('explode');
    explode.value = state.explosion;
    explode.dispatchEvent(new Event('input', { bubbles: true }));
    if (state.view === 'connector') document.getElementById('inspect-connectors').click();
    else document.querySelector(`[data-view="${state.view}"]`).click();
    reply(data.requestId, 'applied');
  });
}
