import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { STEPS } from '../guide/steps.js';

function harness({ initialize = true } = {}) {
  const messages = [], updates = [], handlers = new Map(), timers = new Map();
  let timerId = 0;
  const frame = { contentWindow: { postMessage: message => messages.push(message) },
    addEventListener: (name, fn) => handlers.set(`frame:${name}`, fn), removeEventListener: name => handlers.delete(`frame:${name}`) };
  const context = vm.createContext({ URL, location: { href: 'http://localhost/gay-lussac/' },
    window: { addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name) },
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(readFileSync(new URL('../guide/viewer-adapter.js', import.meta.url), 'utf8').replace('export function', 'function'), context);
  const adapter = context.createViewerAdapter(frame, (state, options) => updates.push({ state, ...options }));
  const last = () => messages.at(-1);
  function reply(type, overrides = {}) {
    handlers.get('message')({ origin: 'http://localhost', source: frame.contentWindow,
      data: { channel: 'gay-lussac-guide', version: 1, requestId: last().requestId, type }, ...overrides });
  }
  const step = id => adapter.applyStep(STEPS.find(item => item.id === id));
  if (initialize) { step('vcc'); step('vcc'); reply('ready'); reply('applied'); }
  return { adapter, messages, updates, last, reply, step, timers, handlers };
}

test('first display waits for the current step, stays visible between steps, and resets on frame reload', () => {
  const h = harness({ initialize: false });
  h.step('vcc');
  assert.equal(h.updates.at(-1).hasAppliedState, false);
  h.handlers.get('frame:load')();
  h.reply('ready');
  const previousRequest = h.last().requestId;
  assert.equal(h.updates.at(-1).hasAppliedState, false);
  h.step('gnd');
  h.reply('applied', { data: { ...h.last(), type: 'applied', requestId: previousRequest } });
  assert.equal(h.updates.at(-1).hasAppliedState, false);
  h.reply('applied');
  assert.equal(h.updates.at(-1).hasAppliedState, true);
  h.step('scl');
  assert.equal(h.updates.at(-1).state, 'loading');
  assert.equal(h.updates.at(-1).hasAppliedState, true);
  h.handlers.get('frame:load')();
  assert.equal(h.updates.at(-1).hasAppliedState, false);
  h.reply('ready'); h.reply('applied');
  assert.equal(h.updates.at(-1).hasAppliedState, true);
  h.adapter.dispose();
});

test('wiring cable selection persists across wires but applies only during wiring; detail resets on step changes', () => {
  const h = harness();
  h.adapter.setCableSide('right');
  assert.equal(h.last().type, 'set-side'); // no camera reset for ordinary cable changes
  h.reply('applied');
  h.adapter.toggleDetail();
  assert.equal(h.last().state.view, 'connector');
  assert.equal(h.last().state.explosion, 60);
  assert.equal(h.last().state.wire, 'vcc');
  h.reply('applied');
  h.adapter.setCableSide('left');
  assert.equal(h.last().type, 'apply-state'); // reframe a close-up when connector positions change
  assert.equal(h.last().state.view, 'connector');
  h.reply('applied'); h.adapter.setCableSide('right'); h.reply('applied');
  h.step('gnd');
  assert.equal(h.last().state.side, 'right');
  assert.equal(h.last().state.view, 'front');
  assert.equal(h.last().state.wire, 'gnd');
  h.step('equipment');
  assert.equal(h.last().state.side, 'left');
  const count = h.messages.length;
  h.adapter.setCableSide('right'); h.adapter.toggleDetail();
  assert.equal(h.messages.length, count);
  h.step('scl');
  assert.equal(h.last().state.side, 'right');
  assert.equal(h.last().state.view, 'front');
  h.adapter.dispose();
  assert.equal(h.timers.size, 0);
  assert.equal(h.handlers.size, 0);
});

test('viewer ignores untrusted and stale acknowledgments and retries the current wiring state after failure', () => {
  const h = harness();
  h.adapter.setCableSide('right');
  const count = h.updates.length;
  h.reply('applied', { origin: 'https://untrusted.example' });
  h.reply('applied', { source: {} });
  h.reply('applied', { data: { ...h.last(), requestId: 'old', type: 'applied' } });
  assert.equal(h.updates.length, count);
  h.reply('error');
  assert.equal(h.updates.at(-1).state, 'unavailable');
  const sent = h.messages.length;
  h.adapter.toggleDetail();
  assert.equal(h.messages.length, sent);
  h.adapter.restoreStep(); h.reply('ready');
  assert.equal(h.last().state.side, 'right');
  assert.equal(h.last().state.view, 'front');
  h.reply('applied');
  assert.equal(h.updates.at(-1).state, 'applied');
  h.adapter.dispose();
});
