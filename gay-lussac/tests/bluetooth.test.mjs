import test from 'node:test';
import assert from 'node:assert/strict';
import * as ble from '../../js/bluetooth.js';

function deviceFixture() {
  class Observable extends EventTarget {
    callbacks = new Map();
    addEventListener(type, listener, options) {
      this.callbacks.set(type, listener); super.addEventListener(type, listener, options);
    }
  }
  const rx = new Observable();
  Object.assign(rx, { uuid: 'rx', properties: { notify: true }, getDescriptors: async () => [],
    startNotifications: async () => {}, stopNotifications: async () => {} });
  const tx = { uuid: 'tx', properties: { write: true }, getDescriptors: async () => [], writeValue: async () => {} };
  const device = new Observable();
  device.gatt = {
    connected: false,
    async connect() { this.connected = true; return { getPrimaryService: async () => ({ getCharacteristics: async () => [tx, rx] }) }; },
    disconnect() { this.connected = false; device.dispatchEvent(new Event('gattserverdisconnected')); },
  };
  return { device, rx, send(text) {
    rx.value = new DataView(new TextEncoder().encode(text).buffer);
    rx.dispatchEvent(new Event('characteristicvaluechanged'));
  } };
}

test('shared BLE module assembles lines and ignores old notification/disconnection events after reconnect', async () => {
  const oldProperty = Object.getOwnPropertyDescriptor(navigator, 'bluetooth');
  let chosen = deviceFixture();
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { requestDevice: async () => chosen.device } });
  const received = [];
  try {
    await ble.connect(await ble.requestDevice());
    await ble.startNotifications((line) => received.push(line));
    chosen.send('25,0,10'); chosen.send('00\r\n26,0,1001\n');
    assert.deepEqual(received, ['25,0,1000', '26,0,1001']);
    const old = chosen;
    const queuedNotification = old.rx.callbacks.get('characteristicvaluechanged');
    const queuedDisconnect = old.device.callbacks.get('gattserverdisconnected');
    old.device.gatt.disconnect();
    chosen = deviceFixture();
    await ble.connect(await ble.requestDevice());
    await ble.startNotifications((line) => received.push(line));
    old.send('99,0,1099\n');
    queuedNotification({ target: old.rx });
    queuedDisconnect({ target: old.device });
    chosen.send('27,0,1002\n');
    assert.deepEqual(received, ['25,0,1000', '26,0,1001', '27,0,1002']);
    assert.equal(ble.getContext().device, chosen.device);
    const remembered = chosen.device;
    await ble.disconnect();
    let disconnects = 0;
    ble.setDisconnectedListener(() => { disconnects++; });
    // Reconnect directly, without requestDevice reattaching the disconnect listener.
    await ble.connect(remembered);
    await ble.startNotifications((line) => received.push(line));
    chosen.send('28,0,1003\n');
    assert.equal(received.at(-1), '28,0,1003');
    remembered.gatt.disconnect();
    assert.equal(disconnects, 1);
    assert.equal(ble.getContext().device, null);
  } finally {
    await ble.disconnect(); ble.setDisconnectedListener(null);
    if (oldProperty) Object.defineProperty(navigator, 'bluetooth', oldProperty);
    else delete navigator.bluetooth;
  }
});
