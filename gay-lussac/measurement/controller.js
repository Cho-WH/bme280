import { readingStatus } from './actions.js';

// Own the measurement pulse independently of screen rendering. The application
// supplies the active session so changing screens never replaces that session.
export function createMeasurementController({ getSession, getMonitor, getConnection, getActions,
  onConfirmed, onRefresh, clock = () => performance.now(), timers = globalThis }) {
  let timer = null;
  function confirmProgress() {
    if (!getActions().hasLiveSession) return;
    const snapshot = getMonitor().getSnapshot(clock());
    const { fresh, ready } = readingStatus(snapshot, getConnection());
    if (ready) onConfirmed('reception');
    if (fresh && snapshot.battery.armed && snapshot.battery.ready) onConfirmed('battery');
    if (getSession()?.getState().placed) onConfirmed('placement');
  }
  function tick() {
    getSession()?.tick();
    confirmProgress();
    onRefresh();
  }
  return {
    tick,
    start() { timer ??= timers.setInterval(tick, 500); },
    dispose() { if (timer !== null) timers.clearInterval(timer); timer = null; },
    acceptInput(input) { getSession()?.acceptInput(input); confirmProgress(); },
    disconnected() {
      const session = getSession();
      if (session) session.disconnected(); else getMonitor().disconnected();
    },
    confirmBattery() { getMonitor().confirmBattery(clock()); confirmProgress(); onRefresh(); },
    markEvent(type, payload) {
      const marked = getSession()?.markEvent(type, payload);
      confirmProgress(); onRefresh(); return marked;
    },
  };
}
