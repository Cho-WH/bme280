import { DATABASE } from './contracts.js';

// idb and its database objects remain inside this adapter. M1 only opens/reads the schema.
export function createRepository({ onUnavailable = () => {} } = {}) {
  let database;
  let opening;
  async function open() {
    if (database) return;
    if (opening) return opening;
    if (!globalThis.indexedDB || !globalThis.idb?.openDB) throw new Error('이 환경에서는 브라우저 저장소를 열 수 없습니다.');
    opening = globalThis.idb.openDB(DATABASE.name, DATABASE.version, {
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
  return {
    open,
    async listRuns() { return (await read('runs')).sort((a, b) => b.updatedAt - a.updatedAt); },
    readRun: (id) => read('runs', id),
    readSamples: (id) => read('samples', id, 'runId'),
    readEvents: (id) => read('events', id, 'runId'),
    readWorkspace: (id) => read('workspaces', id),
    close() { database?.close(); database = undefined; },
  };
}
