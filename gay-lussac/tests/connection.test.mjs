import test from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAM, CONNECTION } from '../program-config.js';
import { decode } from '../measurement/decoder.js';
import { createTransport } from '../measurement/transport.js';
import { createReceptionMonitor } from '../measurement/reception-monitor.js';
import { initialReception, step } from '../diagnostics/reception.js';

const reading = (at, extra = {}) => ({ ...decode('25.12,0,1001.25', PROGRAM.profile),
  monotonicAt: at, receivedAt: 1700000000000 + at, attemptId: 1, ...extra });

test('strict CSV decoding retains out-of-range numbers and unsupported humidity', () => {
  for (const raw of ['25C,0,1000', ',0,1000', '0x10,0,1000', '25,0,Infinity', '25,0,1e999', '25,1000', '25,0,1000,0']) {
    assert.equal(decode(raw, PROGRAM.profile).type, 'parse-error', raw);
  }
  const valid = decode(' +2.512e1, 12, 1.00125e3 ', PROGRAM.profile);
  assert.equal(valid.temperatureC, 25.12);
  assert.equal(valid.extraChannels.humidityPct, 12);
  assert.equal(valid.validity.humidityPct, 'unsupported');
  const out = decode('-140.87,0,1719.18', PROGRAM.profile);
  assert.equal(out.type, 'reading');
  assert.equal(out.pressureHpa, 1719.18);
  assert.equal(out.validity.pressureHpa, 'out-of-range');
});

test('a packet burst does not confirm reception; errors, gaps and attempts restart confirmation', () => {
  let state = initialReception();
  const accept = (input, now = input.monotonicAt) => {
    const result = step(state, input, now, CONNECTION); state = result.nextState; return result.observation;
  };
  [0, 0, 0, 0].forEach((at) => assert.equal(accept(reading(at)).ready, false));
  assert.equal(accept(reading(999)).ready, false);
  assert.equal(accept(reading(1000)).ready, true);
  assert.equal(step(state, null, 6000, CONNECTION).observation.state, 'stale');
  assert.equal(accept(reading(6000)).ready, false);
  accept(reading(6500));
  assert.equal(accept(reading(7000)).ready, true);
  assert.equal(accept(reading(7100, { attemptId: 2 })).ready, false);
  assert.equal(accept({ type: 'parse-error', monotonicAt: 7200 }).count, 0);
  assert.equal(accept(reading(7300)).ready, false);
});

test('battery confirmation requires new readings after the user confirmation, and resets on disconnect', () => {
  const monitor = createReceptionMonitor();
  [0, 500, 1000].forEach((at) => monitor.accept(reading(at)));
  assert.equal(monitor.getSnapshot(1000).reception.ready, true);
  monitor.confirmBattery(1000);
  assert.equal(monitor.getSnapshot(1000).battery.ready, false);
  [1000, 1500, 1500, 1500].forEach((at) => monitor.accept(reading(at)));
  assert.equal(monitor.getSnapshot(1500).battery.ready, false);
  monitor.accept(reading(2500));
  assert.equal(monitor.getSnapshot(2500).battery.ready, true);
  monitor.disconnected();
  assert.equal(monitor.getSnapshot(2501).battery.ready, false);
  monitor.accept(reading(2600, { attemptId: 2 }));
  assert.equal(monitor.getSnapshot(2600).battery.ready, false);
});

test('display cache retains timestamps and validity without segment IDs', () => {
  const monitor = createReceptionMonitor();
  [0, 500, 1000].forEach((at) => monitor.accept(reading(at)));
  monitor.accept(reading(1500, { receivedAt: 1700000101500 }));
  let snapshot = monitor.getSnapshot(1500);
  assert.ok(snapshot.points.every(p => !('segmentId' in p)));
  assert.equal(snapshot.reception.ready, false);
  monitor.accept(reading(70000));
  snapshot = monitor.getSnapshot(70000);
  assert.equal(snapshot.points.length, 1);
  assert.equal(snapshot.points[0].monotonicAt, 70000);
});

class Timers {
  now = 0; sequence = 0; tasks = new Map();
  setTimeout = (fn, delay) => { const id = ++this.sequence; this.tasks.set(id, { fn, at: this.now + delay }); return id; };
  clearTimeout = (id) => this.tasks.delete(id);
  async advance(ms) {
    const until = this.now + ms;
    while (true) {
      const due = [...this.tasks].filter(([, task]) => task.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.tasks.delete(due[0]); this.now = due[1].at; await due[1].fn();
    }
    this.now = until;
  }
}
function fakeBle() {
  return {
    sends: 0, cleanups: 0, handlers: [], listener: null,
    isSupported: () => true,
    requestDevice: async () => ({ name: 'test device' }),
    connect: async () => {},
    startNotifications: async function (handler) { this.handlers.push(handler); },
    setDisconnectedListener(listener) { this.listener = listener; },
    sendBmeCommand: async function () { this.sends++; },
    disconnect: async function () { this.cleanups++; },
  };
}
function fixture(ble = fakeBle()) {
  const timers = new Timers(), inputs = [], states = [];
  const transport = createTransport({ ble, timers, clock: { utc: () => timers.now, mono: () => timers.now } });
  return { ble, timers, inputs, states, transport,
    connect: (options) => transport.connect(PROGRAM.profile, (input) => inputs.push(input), (state) => states.push(state), options) };
}

test('additional connection reuses the device without a chooser and keeps fresh input attempts', async () => {
  const ble = fakeBle(), device = { name: 'previous micro:bit' };
  let requests = 0; const connected = [];
  ble.requestDevice = async () => { requests++; return device; };
  ble.connect = async selected => { connected.push(selected); };
  const f = fixture(ble);
  await f.connect();
  const oldHandler = ble.handlers[0]; oldHandler('25,0,1000');
  await f.transport.disconnect();
  await f.connect({ reuseDevice: true });
  oldHandler('99,0,1099'); ble.handlers[1]('26,0,1001');
  assert.equal(requests, 1);
  assert.deepEqual(connected, [device, device]);
  assert.deepEqual(f.inputs.map(input => input.temperatureC), [25, 26]);
  assert.notEqual(f.inputs[0].attemptId, f.inputs[1].attemptId);
  await f.transport.disconnect();
  f.transport.forgetDevice();
  await f.connect({ reuseDevice: true });
  assert.equal(requests, 1);
  assert.equal(connected.length, 2);
  assert.match(f.transport.getState().message, /장치 정보가 없어요/);
});

test('failed direct reconnection never opens a chooser and permits an explicit new selection', async () => {
  const ble = fakeBle(); let requests = 0;
  ble.requestDevice = async () => { requests++; return { name: 'micro:bit' }; };
  const f = fixture(ble); await f.connect(); await f.transport.disconnect();
  ble.connect = async () => { throw Object.assign(new Error('offline'), { name: 'NetworkError' }); };
  await f.connect({ reuseDevice: true });
  assert.equal(requests, 1);
  assert.equal(f.transport.getState().busy, false);
  assert.equal(f.transport.getState().status, 'disconnected');
  assert.match(f.transport.getState().message, /다시 연결하지 못했어요/);
  ble.connect = async () => {};
  await f.connect();
  assert.equal(requests, 2);
  assert.equal(f.transport.getState().status, 'connected');
  await f.transport.disconnect();
});

test('retries are bounded; invalid values do not cancel first-reading timeout', async () => {
  const f = fixture(); await f.connect();
  f.ble.handlers[0]('25C,0,1000');
  f.ble.handlers[0]('25,0,0');
  await f.timers.advance(2999);
  assert.equal(f.ble.sends, CONNECTION.retryLimit);
  assert.equal(f.transport.getState().status, 'connected');
  await f.timers.advance(1);
  assert.equal(f.transport.getState().status, 'disconnected');
  assert.equal(f.timers.tasks.size, 0);
  assert.match(f.transport.getState().message, /새 온도/);
});

test('a first reading received during notification setup prevents unnecessary retries', async () => {
  const ble = fakeBle();
  ble.startNotifications = async (handler) => handler('25,0,1000');
  const f = fixture(ble); await f.connect(); await f.timers.advance(4000);
  assert.equal(f.inputs.length, 1);
  assert.equal(f.ble.sends, 0);
  assert.equal(f.transport.getState().status, 'connected');
  await f.transport.disconnect();
});

test('callbacks from a disconnected attempt cannot become readings in a new connection', async () => {
  const f = fixture(); await f.connect();
  const old = f.ble.handlers[0]; old('25,0,1000');
  f.ble.listener();
  await f.connect();
  old('99,0,1099');
  f.ble.handlers[1]('26,0,1001');
  assert.deepEqual(f.inputs.map((input) => input.temperatureC), [25, 26]);
  assert.notEqual(f.inputs[0].attemptId, f.inputs[1].attemptId);
  await f.transport.disconnect();
});

test('cancelling during a pending device chooser cleans up before another attempt', async () => {
  const ble = fakeBle(); let selected;
  ble.requestDevice = () => new Promise((resolve) => { selected = resolve; });
  const f = fixture(ble); const connecting = f.connect();
  const closing = f.transport.disconnect();
  assert.equal(f.transport.getState().busy, true);
  f.connect(); // Must not open a second chooser.
  selected({ name: 'late device' });
  await Promise.all([connecting, closing]);
  assert.equal(f.ble.handlers.length, 0);
  assert.equal(f.transport.getState().status, 'disconnected');
  assert.equal(f.transport.getState().busy, false);
});

test('device selection starts synchronously and can be retried after cancelling additional connection', async () => {
  const ble = fakeBle(); let requests = 0;
  ble.requestDevice = () => {
    requests++;
    return requests === 1
      ? Promise.reject(Object.assign(new Error('cancelled'), { name: 'NotFoundError' }))
      : Promise.resolve({ name: 'test device' });
  };
  const f = fixture(ble);
  const cancelled = f.connect();
  assert.equal(requests, 1); // No await may precede the device chooser.
  await cancelled;
  assert.equal(f.transport.getState().status, 'disconnected');
  assert.equal(f.transport.getState().busy, false);
  assert.match(f.transport.getState().message, /취소/);
  await f.connect();
  f.ble.handlers[0]('26,0,1001');
  assert.equal(requests, 2);
  assert.equal(f.transport.getState().status, 'connected');
  assert.equal(f.inputs[0].temperatureC, 26);
  await f.transport.disconnect();
});
