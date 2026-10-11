import { DATABASE } from './contracts.js';

// idb and its database objects never leave this adapter.
export function createRepository({ onUnavailable = () => {}, databaseName = DATABASE.name } = {}) {
  let database;
  let opening;
  async function open() {
    if (database) return;
    if (opening) return opening;
    if (!globalThis.indexedDB || !globalThis.idb?.openDB) throw new Error('이 환경에서는 브라우저 저장소를 열 수 없습니다.');
    opening = globalThis.idb.openDB(databaseName, DATABASE.version, {
      upgrade(db) {
        db.createObjectStore('runs', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        const samples = db.createObjectStore('samples', { keyPath: ['runId', 'sampleId'] });
        samples.createIndex('runId', 'runId');
        samples.createIndex('runSegment', ['runId', 'segmentId']);
        db.createObjectStore('events', { keyPath: ['runId', 'eventId'] }).createIndex('runId', 'runId');
        db.createObjectStore('workspaces', { keyPath: 'runId' });
      },
      blocked() { onUnavailable('다른 탭을 닫은 뒤 저장소 열기를 다시 시도해 주세요.'); },
      blocking() { database?.close(); database = undefined; onUnavailable('저장소가 다른 탭에서 갱신되었습니다. 다시 열어 주세요.'); },
      terminated() { database = undefined; onUnavailable('브라우저 저장소 연결이 종료되었습니다.'); },
    }).then((db) => { database = db; }).finally(() => { opening = undefined; });
    return opening;
  }
  async function read(store, key, index) {
    await open();
    if (index) return database.getAllFromIndex(store, index, key);
    return key === undefined ? database.getAll(store) : database.get(store, key);
  }
  async function readSnapshot(id) {
    await open();
    const tx = database.transaction(['runs', 'samples', 'events', 'workspaces']);
    const [run, samples, events, workspace] = await Promise.all([
      tx.objectStore('runs').get(id), tx.objectStore('samples').index('runId').getAll(id),
      tx.objectStore('events').index('runId').getAll(id), tx.objectStore('workspaces').get(id),
    ]);
    await tx.done;
    return run ? { run, samples, events, workspace: workspace ?? null } : null;
  }
  async function commitBatch({ run, samples, events, workspace, baseRunRevision }) {
    await open();
    const tx = database.transaction(['runs', 'samples', 'events', 'workspaces'], 'readwrite');
    try {
      const previous = await tx.objectStore('runs').get(run.id);
      // Reject stale writers, but allow an identical retry after a lost acknowledgement.
      if ((previous?.runRevision ?? 0) !== baseRunRevision && !sameRecord(previous, run)) {
        throw new Error('다른 저장 내용과 충돌했어요. 이 탭의 자료를 CSV로 보관해 주세요.');
      }
      for (const [name, records, key] of [['samples', samples, 'sampleId'], ['events', events, 'eventId']]) {
        const store = tx.objectStore(name);
        for (const record of records) {
          if (record.runId !== run.id) throw new Error('실험 ID가 일치하지 않습니다.');
          const existing = await store.get([run.id, record[key]]);
          if (existing && !sameRecord(existing, record)) throw new Error('원자료 ID가 충돌했습니다. 원자료는 덮어쓰지 않습니다.');
          if (!existing) await store.add(record);
        }
      }
      if (workspace) await tx.objectStore('workspaces').put(workspace);
      await tx.objectStore('runs').put(run);
      await tx.done;
      return { sampleId: run.lastSavedSampleId, eventId: run.lastSavedEventId,
        runRevision: run.runRevision, workspaceRevision: workspace?.workspaceRevision ?? null };
    } catch (error) {
      try { tx.abort(); } catch { /* It may already have aborted. */ }
      await tx.done.catch(() => {});
      throw error;
    }
  }
  return {
    open, readSnapshot, commitBatch,
    async listRuns() { return (await read('runs')).sort((a, b) => b.updatedAt - a.updatedAt); },
    readRun: (id) => read('runs', id),
    readSamples: (id) => read('samples', id, 'runId'),
    readEvents: (id) => read('events', id, 'runId'),
    readWorkspace: (id) => read('workspaces', id),
    close() { database?.close(); database = undefined; },
  };
}

function sameRecord(a, b) {
  const canonical = (value) => value && typeof value === 'object'
    ? Array.isArray(value) ? value.map(canonical)
      : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
