import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { createProgrammer } from '../guide/programmer-adapter.js';
import { PROGRAM } from '../program-config.js';

const firmware = await readFile(new URL('../../firmware/bme_1.2.hex', import.meta.url));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function fixture(overrides = {}) {
  const calls = [];
  const usb = {
    initialize: async () => { calls.push('initialize'); },
    connect: async () => { calls.push('connect'); },
    getBoardVersion: () => 'V2', getDevice: () => ({ productName: 'test V2' }),
    flash: async (source, options) => {
      calls.push('flash');
      assert.equal(options.partial, false);
      assert.match(await source('V2'), /^:/);
    },
    disconnect: async () => { calls.push('disconnect'); }, dispose: () => { calls.push('dispose'); },
  };
  const programmer = createProgrammer({
    program: PROGRAM, crypto: webcrypto, supported: () => true,
    fetchFile: async () => new Response(firmware), createConnection: () => usb,
    beforeFlash: async () => { calls.push('stop-ble'); }, ...overrides,
  });
  return { programmer, usb, calls };
}

test('verified real HEX uses official V2 reader; progress 100 does not mean success; concurrent clicks cannot double flash', async () => {
  const { programmer, usb, calls } = fixture();
  const completed = deferred(), flashing = deferred();
  usb.flash = async (source, options) => {
    assert.match(await source('V2'), /^:/);
    assert.equal(options.partial, false);
    calls.push('flash'); options.progress('FullFlashing', 1); flashing.resolve();
    await completed.promise;
  };
  await programmer.prepare();
  const first = programmer.install();
  assert.equal(calls.at(-1), 'connect', 'USB starts before waiting on preparation or BLE');
  assert.equal(programmer.install(), first);
  await flashing.promise;
  assert.equal(programmer.getState().status, 'flashing');
  assert.equal(programmer.getState().progress, 100);
  assert.equal(programmer.getState().canInstall, false);
  completed.resolve(); await first;
  assert.deepEqual(calls, ['initialize', 'connect', 'stop-ble', 'flash', 'disconnect']);
  assert.equal(programmer.getState().status, 'success');
  await programmer.dispose();
});

test('wrong hash and unsupported browser never open or write to USB', async () => {
  for (const overrides of [{ fetchFile: async () => new Response('damaged HEX') }, { supported: () => false }]) {
    const { programmer, calls } = fixture(overrides);
    await programmer.prepare(); await programmer.install();
    assert.equal(programmer.getState().canInstall, false);
    assert.deepEqual(calls, []);
  }
});

test('cancel, wrong board and cable loss remain unsuccessful; a later attempt can succeed', async () => {
  const { programmer, usb, calls } = fixture();
  await programmer.prepare();
  usb.connect = async () => { throw { code: 'no-device-selected' }; };
  await programmer.install();
  assert.equal(programmer.getState().status, 'cancelled');
  assert.equal(calls.includes('stop-ble'), false);
  usb.connect = async () => {};
  usb.getBoardVersion = () => 'V1';
  await programmer.install();
  assert.equal(programmer.getState().status, 'error');
  assert.equal(calls.includes('flash'), false);
  assert.equal(calls.includes('stop-ble'), false);
  usb.getBoardVersion = () => 'V2';
  usb.flash = async (_source, options) => { options.progress('FullFlashing', 0.5); throw { code: 'device-disconnected' }; };
  await programmer.install();
  assert.equal(programmer.getState().status, 'error');
  assert.equal(programmer.getState().progress, null);
  assert.equal(calls.at(-1), 'disconnect');
  usb.flash = async () => {};
  await programmer.install();
  assert.equal(programmer.getState().status, 'success');
  await programmer.dispose();
});

test('leaving during file preparation prevents a later USB connection', async () => {
  const file = deferred();
  const { programmer, calls } = fixture({ fetchFile: () => file.promise });
  const preparing = programmer.prepare();
  const disposing = programmer.dispose();
  file.resolve(new Response(firmware));
  await Promise.all([preparing, disposing]);
  await programmer.install();
  assert.deepEqual(calls, []);
});
