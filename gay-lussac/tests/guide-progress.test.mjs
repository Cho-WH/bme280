import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuideProgress } from '../guide/progress.js';
import { STEPS } from '../guide/steps.js';

test('confirmed steps survive reopening, stay isolated by experiment and reset only the additional-measurement checks', () => {
  const saved = new Map();
  const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) };
  const progress = createGuideProgress(STEPS, () => storage);
  assert.deepEqual(progress.open('one'), []);
  for (const id of ['equipment', 'vcc', 'program', 'reception', 'battery', 'placement']) assert.equal(progress.confirm(id), true);
  assert.equal(progress.confirm('equipment'), false);
  assert.equal(progress.confirm('unknown'), false);
  const reopened = createGuideProgress(STEPS, () => storage);
  assert.deepEqual(reopened.open('one'), progress.getCompleted());
  assert.deepEqual(reopened.open('two'), []);
  reopened.open('one'); reopened.clear(['reception', 'battery', 'placement']);
  assert.deepEqual(reopened.open('one'), ['equipment', 'vcc', 'program']);
});

test('invalid or inaccessible UI storage never blocks preparation and cannot invent completed steps', () => {
  for (const value of ['{bad', '{}', '["equipment","unknown","equipment"]']) {
    const progress = createGuideProgress(STEPS, () => ({ getItem: () => value, setItem() {} }));
    assert.deepEqual(progress.open('one'), value.startsWith('[') ? ['equipment'] : []);
  }
  const progress = createGuideProgress(STEPS, () => { throw new Error('storage unavailable'); });
  assert.deepEqual(progress.open('one'), []);
  assert.equal(progress.confirm('usb'), true);
  assert.deepEqual(progress.getCompleted(), ['usb']);
});
