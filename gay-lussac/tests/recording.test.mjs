import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { openRunStore } from '../data/run-store.js';
import { createSession } from '../measurement/session.js';
import { PROGRAM } from '../program-config.js';
import { decode } from '../measurement/decoder.js';
import { buildCsv } from '../data/files.js';

const require = createRequire(import.meta.url);
globalThis.Papa = require('../vendor/papaparse-5.7.0.min.js');
const copy = structuredClone;
const utc = 1700000000000;
const reading = (ms, extra = {}) => ({ ...decode('25,0,1000', PROGRAM.profile),
  attemptId: 1, receivedAt: utc + ms, monotonicAt: ms, ...extra });
const timers = { setTimeout: () => 1, clearTimeout() {} };
function locks() {
  const held = new Set();
  return { async request(name, options, callback) {
    if (held.has(name)) return callback(null);
    held.add(name);
    try { return await callback({ name }); } finally { held.delete(name); }
  } };
}
function repository() {
  const runs = new Map(), samples = new Map(), events = new Map(), workspaces = new Map();
  return {
    async readSnapshot(id) { return runs.has(id) ? copy({ run: runs.get(id), samples: [...samples.values()].filter(s => s.runId === id),
      events: [...events.values()].filter(e => e.runId === id), workspace: workspaces.get(id) ?? null }) : null; },
    async commitBatch(batch) {
      const { run, workspace } = copy(batch);
      for (const s of batch.samples) samples.set(`${run.id}:${s.sampleId}`, copy(s));
      for (const e of batch.events) events.set(`${run.id}:${e.eventId}`, copy(e));
      runs.set(run.id, run);
      if (workspace) workspaces.set(run.id, workspace);
      return { sampleId: run.lastSavedSampleId, eventId: run.lastSavedEventId,
        runRevision: run.runRevision, workspaceRevision: workspace?.workspaceRevision ?? null };
    },
  };
}
async function fixture(extra = {}) {
  const repo = extra.repository ?? repository();
  let ms = 0;
  const store = await openRunStore({ repository: repo, id: 'test', create: true, program: PROGRAM,
    source: 'replay', locks: extra.locks ?? locks(), timers: extra.timers ?? timers, now: () => utc + ms });
  const clock = { utc: () => utc + ms, mono: () => ms };
  const session = createSession({ store, clock });
  return { repo, store, session, clock, at(value) { ms = value; },
    accept(value, overrides) { ms = value; session.acceptInput(reading(value, overrides)); } };
}

test('in-flight saving acknowledges only captured IDs and revisions; snapshots remain stable', async () => {
  const repo = repository(), commit = repo.commitBatch;
  let release, captured;
  repo.commitBatch = batch => { captured = copy(batch); return new Promise(resolve => { release = () => commit(batch).then(resolve); }); };
  const f = await fixture({ repository: repo });
  f.accept(0); f.store.saveWorkspace({ workspaceRevision: 1, analysisInputRevision: 1, note: 'first' });
  const flushing = f.store.flush();
  f.accept(500); f.store.saveWorkspace({ workspaceRevision: 2, analysisInputRevision: 1, note: 'second' });
  const snapshot = f.store.getSnapshot();
  await release(); await flushing;
  assert.equal(captured.samples.length, 1);
  assert.equal(f.store.getState().savedSampleId, 1);
  assert.equal(f.store.getState().status, 'pending');
  assert.equal(f.store.getState().pendingSamples, 1);
  f.accept(1000);
  assert.equal(snapshot.samples.length, 2);
  assert.equal(snapshot.workspace.note, 'second');
  repo.commitBatch = commit;
  await f.store.flush();
  const restored = await repo.readSnapshot('test');
  assert.equal(restored.samples.length, 3);
  assert.equal(restored.workspace.workspaceRevision, 2);
  assert.equal(f.store.getState().status, 'clean'); f.store.dispose();
});

test('failed and uncertain writes retain the exact batch for retry before later inputs', async () => {
  const repo = repository(), commit = repo.commitBatch, attempts = [];
  let fail = true;
  repo.commitBatch = async batch => { attempts.push(copy(batch)); const ack = await commit(batch);
    if (fail) throw new Error('ack lost'); return ack; };
  const f = await fixture({ repository: repo }); f.accept(0);
  await assert.rejects(f.store.flush(), /ack lost/);
  f.accept(500);
  assert.equal(f.store.getState().status, 'error');
  assert.equal(f.store.getSnapshot().samples.length, 2);
  fail = false; await f.store.flush();
  assert.deepEqual(attempts[1], attempts[0]);
  assert.equal(attempts[2].samples[0].sampleId, 2);
  assert.equal((await repo.readSnapshot('test')).samples.length, 2); f.store.dispose();
});

test('raw invalid values, gaps, attempts and clock changes preserve IDs and break segments', async () => {
  const f = await fixture();
  f.accept(0, { temperatureC: -100, validity: { temperatureC: 'out-of-range', pressureHpa: 'valid' } });
  [500, 1000, 1500].forEach(ms => f.accept(ms));
  f.at(6500); f.session.tick(); f.session.tick();
  [6600, 7100, 7600].forEach(ms => f.accept(ms));
  f.session.disconnected(); f.accept(7700, { attemptId: 2 });
  f.accept(7800, { attemptId: 2, receivedAt: utc - 20000 });
  const snapshot = f.store.getSnapshot();
  assert.deepEqual(snapshot.samples.map(s => s.sampleId), [1,2,3,4,5,6,7,8,9]);
  assert.equal(snapshot.samples[0].segmentId, null);
  assert.equal(snapshot.samples[0].temperatureC, -100);
  assert.equal(snapshot.run.segments.length, 4);
  assert.equal(snapshot.events.filter(e => e.type === 'reception-change' && e.payload.state === 'stale').length, 2);
  assert.ok(snapshot.events.some(e => e.type === 'discontinuity' && e.payload.reason === 'clock-change'));
  f.store.dispose();
});

test('heating requires placement and sustained fresh values; finishing closes input exactly once', async () => {
  const f = await fixture(); f.accept(0);
  assert.equal(f.session.markEvent('heating-start'), false);
  f.session.markEvent('placement');
  assert.equal(f.session.markEvent('heating-start'), false);
  f.accept(500); f.accept(1000);
  assert.equal(f.session.markEvent('heating-start'), true);
  assert.equal(f.session.markEvent('heating-start'), false);
  f.session.markEvent('water-added');
  await Promise.all([f.session.finish(), f.session.finish()]);
  f.accept(1500); f.session.markEvent('water-added');
  const snapshot = await f.repo.readSnapshot('test');
  assert.equal(snapshot.run.status, 'complete');
  assert.equal(snapshot.samples.length, 3);
  assert.equal(snapshot.events.filter(e => e.type === 'measurement-end').length, 1);
  assert.equal(snapshot.events.filter(e => e.type === 'water-added').length, 1); f.store.dispose();
});

test('finish failure allows temporary analysis and CSV without reopening measurement', async () => {
  const f = await fixture(); f.accept(0); await f.store.flush();
  f.accept(500); f.repo.commitBatch = async () => { throw new Error('quota'); };
  await assert.rejects(f.session.finish(), /quota/);
  assert.equal(f.session.getState().state, 'finishing');
  f.session.useTemporary(); f.accept(1000);
  const snapshot = f.store.getSnapshot();
  assert.equal(snapshot.samples.length, 2);
  assert.equal(snapshot.run.status, 'complete');
  assert.equal(f.store.getState().status, 'error');
  const csv = buildCsv(snapshot);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const parsed = globalThis.Papa.parse(csv, { header: true });
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.data.length, 2);
  assert.equal(parsed.data[1].segment_elapsed_ms, '500');
  assert.equal(parsed.data[1].pressure_hpa, '1000'); f.store.dispose();
});

test('one writer survives screen-independent use; reopen resumes with next IDs and a new segment', async () => {
  const sharedLocks = locks(), f = await fixture({ locks: sharedLocks }); f.accept(0); await f.store.flush();
  const second = await openRunStore({ repository: f.repo, id: 'test', locks: sharedLocks, timers });
  assert.equal(second.getState().writable, false);
  assert.throws(() => second.updateRun({ name: 'overwrite' }), /읽기 전용/);
  assert.equal(second.getSnapshot().samples.length, 1);
  second.dispose(); await f.store.close();
  const reopened = await openRunStore({ repository: f.repo, id: 'test', locks: sharedLocks, timers });
  assert.equal(reopened.getState().writable, true);
  const next = createSession({ store: reopened, clock: f.clock });
  next.acceptInput(reading(2000)); await reopened.flush();
  assert.equal(reopened.getSnapshot().samples[1].sampleId, 2);
  assert.equal(reopened.getSnapshot().samples[1].segmentId, 2);
  assert.equal(reopened.getSnapshot().samples[1].segmentElapsedMs, 0); await reopened.close();
});

test('new readings do not postpone the one-second automatic save', async () => {
  const tasks = new Map(); let sequence = 0, commits = 0;
  const scheduled = { setTimeout(fn, delay) { const id = ++sequence; tasks.set(id, { fn, delay }); return id; },
    clearTimeout(id) { tasks.delete(id); } };
  const repo = repository(), commit = repo.commitBatch;
  repo.commitBatch = batch => { commits++; return commit(batch); };
  const f = await fixture({ repository: repo, timers: scheduled });
  for (let ms = 0; ms < 1000; ms += 100) f.accept(ms);
  assert.equal(tasks.size, 1);
  const task = [...tasks.values()][0]; assert.equal(task.delay, 1000);
  tasks.clear(); task.fn();
  assert.equal(commits, 1); // The timer, not a manual flush, started the transaction.
  await f.store.flush();
  assert.equal(f.store.getState().savedSampleId, 10); f.store.dispose();
});

test('parse errors are events, no-value ticks repeat no warnings, completed runs reject new input', async () => {
  const f = await fixture(); f.accept(0);
  f.at(100); f.session.acceptInput({ type: 'parse-error', reasonCode: 'bad-number', receivedAt: utc + 100, monotonicAt: 100, attemptId: 1 });
  f.at(10000); f.session.tick(); f.session.tick();
  assert.equal(f.store.getSnapshot().samples.length, 1);
  assert.equal(f.store.getSnapshot().events.filter(e => e.type === 'parse-error').length, 1);
  assert.equal(f.store.getSnapshot().events.filter(e => e.type === 'reception-change' && e.payload.state === 'stale').length, 1);
  await f.session.finish();
  const ended = createSession({ store: f.store, clock: f.clock });
  ended.acceptInput(reading(20000));
  assert.equal(f.store.getSnapshot().samples.length, 1); f.store.dispose();
});

test('pause keeps live preview without storing readings; resume starts a distinct recorded segment', async () => {
  const f = await fixture(); [0, 500, 1000].forEach(ms => f.accept(ms));
  f.session.markEvent('placement'); f.session.markEvent('heating-start');
  f.at(1100); await Promise.all([f.session.pause(), f.session.pause()]);
  const pausedEvents = f.store.getState().eventCount;
  f.accept(1200, { temperatureC: 30 }); f.at(9000); f.session.tick();
  assert.equal(f.session.monitor.getSnapshot(1200).latest.temperatureC, 30);
  assert.equal(f.session.monitor.getSnapshot(1200).points.length, 3);
  assert.equal(f.store.getState().sampleCount, 3);
  assert.equal(f.store.getState().eventCount, pausedEvents);
  assert.equal(f.store.getState().runStatus, 'paused');
  assert.equal(f.session.markEvent('device-change', { kind: 'moved', note: 'during pause' }), true);
  f.session.disconnected();
  assert.equal(f.session.getState().state, 'paused');
  f.accept(10000, { attemptId: 2 });
  assert.equal(f.store.getState().sampleCount, 3);
  assert.equal(f.session.resume(), true); assert.equal(f.session.resume(), false);
  f.accept(10100, { attemptId: 2 });
  await f.session.finish();
  const snapshot = await f.repo.readSnapshot('test');
  assert.deepEqual(snapshot.samples.map(s => s.sampleId), [1,2,3,4]);
  assert.equal(snapshot.samples[3].segmentId, 2);
  assert.equal(snapshot.samples[3].segmentElapsedMs, 0);
  assert.equal(snapshot.run.segments[0].endReason, 'paused');
  assert.equal(snapshot.events.filter(e => e.type === 'recording-paused').length, 1);
  assert.equal(snapshot.events.filter(e => e.type === 'recording-resumed').length, 1);
  const chartPoints = f.session.monitor.getSnapshot(10100).points;
  assert.notEqual(chartPoints[2].segmentId, chartPoints[3].segmentId);
  f.store.dispose();
});

test('pause survives reopen; failed pause saving never starts recording again and can finish', async () => {
  const sharedLocks = locks(), f = await fixture({ locks: sharedLocks }); f.accept(0);
  const commit = f.repo.commitBatch;
  f.repo.commitBatch = async () => { throw new Error('quota'); };
  await assert.rejects(f.session.pause(), /quota/);
  f.accept(500); assert.equal(f.store.getState().sampleCount, 1);
  assert.equal(f.session.getState().state, 'paused');
  f.repo.commitBatch = commit; await f.store.close();
  const store = await openRunStore({ repository: f.repo, id: 'test', locks: sharedLocks, timers });
  const paused = createSession({ store, clock: f.clock });
  paused.acceptInput(reading(1000));
  assert.equal(paused.getState().state, 'paused');
  assert.equal(store.getState().sampleCount, 1);
  await paused.finish();
  assert.equal(store.getState().runStatus, 'complete');
  assert.equal(store.getState().status, 'clean'); await store.close();
});

test('additional measurement validates conditions and preserves original samples, analysis and IDs', async () => {
  const f = await fixture(); [0, 500, 1000].forEach(ms => f.accept(ms));
  f.session.markEvent('placement'); f.session.markEvent('heating-start');
  f.store.saveWorkspace({ workspaceRevision: 1, analysisInputRevision: 1, candidateIds: [1,2,3], regression: { slope: 3 } });
  await f.session.finish();
  const original = f.store.getSnapshot();
  const confirmation = { conditions: { container: 'same', seal: 'changed', sensor: 'unsure' }, note: '' };
  assert.throws(() => f.session.startAdditional({}), /각 조건/);
  assert.throws(() => f.session.startAdditional(confirmation), /메모/);
  assert.equal(f.store.getState().runStatus, 'complete');
  f.session.startAdditional({ ...confirmation, note: '뚜껑을 열고 센서 위치를 확인함' });
  assert.throws(() => f.session.startAdditional(confirmation), /마친 뒤/);
  assert.equal(f.session.getState().heating, false);
  assert.equal(f.session.getState().placed, false);
  f.accept(20000); await f.session.finish();
  const result = await f.repo.readSnapshot('test');
  assert.deepEqual(result.samples.slice(0,3), original.samples);
  assert.equal(result.samples[3].sampleId, 4); assert.equal(result.samples[3].segmentId, 2);
  assert.deepEqual(result.workspace, original.workspace);
  assert.equal(original.samples.length, 3);
  assert.equal(result.events.filter(e => e.type === 'measurement-end').length, 2);
  const added = result.events.find(e => e.type === 'additional-measurement');
  assert.equal(added.payload.previousLastSampleId, 3);
  assert.equal(added.payload.conditions.seal, 'changed');
  assert.equal(added.payload.note, '뚜껑을 열고 센서 위치를 확인함');
  const reopened = createSession({ store: f.store, clock: f.clock });
  assert.equal(reopened.getState().heating, false);
  reopened.startAdditional({ conditions: { container: 'same', seal: 'same', sensor: 'same' } });
  reopened.acceptInput(reading(21000)); await reopened.finish();
  assert.equal(f.store.getSamples().at(-1).segmentId, 3); f.store.dispose();
});

test('additional measurement is blocked until failed completion is saved and for read-only runs', async () => {
  const f = await fixture(); f.accept(0); const commit = f.repo.commitBatch;
  f.repo.commitBatch = async () => { throw new Error('quota'); };
  await assert.rejects(f.session.finish(), /quota/); f.session.useTemporary();
  const checked = { conditions: { container: 'same', seal: 'same', sensor: 'same' } };
  assert.throws(() => f.session.startAdditional(checked), /저장하고 작성 권한/);
  f.repo.commitBatch = commit; await f.store.flush();
  const readonly = await openRunStore({ repository: f.repo, id: 'test', locks: { request: async (_, __, cb) => cb(null) }, timers });
  assert.throws(() => createSession({ store: readonly }).startAdditional(checked), /저장하고 작성 권한/);
  readonly.dispose(); f.store.dispose();
});
