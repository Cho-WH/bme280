import test from 'node:test';
import assert from 'node:assert/strict';
import { createExperimentGuidePreferences } from '../guide/experiment-guide-preferences.js';

test('guide viewing is remembered per experiment; suppression spans new experiments and can be reversed', () => {
  const saved = new Map();
  const storage = { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
  const preferences = createExperimentGuidePreferences(() => storage);
  assert.equal(preferences.shouldShow(null), false);
  assert.equal(preferences.shouldShow('one'), true);
  preferences.markSeen('one');
  const reopened = createExperimentGuidePreferences(() => storage);
  assert.equal(reopened.shouldShow('one'), false);
  assert.equal(reopened.shouldShow('two'), true);
  reopened.setSuppressed(true);
  assert.equal(preferences.shouldShow('two'), false);
  reopened.setSuppressed(false);
  assert.equal(preferences.shouldShow('one'), false);
  assert.equal(preferences.shouldShow('two'), true);
  reopened.forget('one');
  assert.equal(preferences.shouldShow('one'), true);
});

test('unavailable preference storage remembers choices in memory without blocking the guide', () => {
  for (const getStorage of [() => { throw new Error('denied'); }, () => undefined,
    () => ({ getItem: () => null, setItem: () => { throw new Error('quota exceeded'); } })]) {
    const preferences = createExperimentGuidePreferences(getStorage);
    assert.equal(preferences.shouldShow('one'), true);
    preferences.markSeen('one');
    assert.equal(preferences.shouldShow('one'), false);
    preferences.setSuppressed(true);
    assert.equal(preferences.shouldShow('two'), false);
    preferences.setSuppressed(false);
    assert.equal(preferences.shouldShow('two'), true);
  }
});
