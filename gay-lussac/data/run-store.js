import { withEventNote } from './contracts.js';

// One owner for both confirmed data and pending changes. UI caches never become records.
export async function openRunStore({ repository, id = crypto.randomUUID(), program, source = 'device',
  name, create = false, locks = globalThis.navigator?.locks, timers = globalThis,
  now = () => Date.now(), saveDelay = 1000, onChange = () => {} }) {
  let releaseLock = () => {};
  let lockTask;
  const writable = locks ? await new Promise((resolve, reject) => {
    lockTask = locks.request(`bme280.gay-lussac:run:${id}`, { ifAvailable: true }, async (lock) => {
      if (!lock) { resolve(false); return; }
      const held = new Promise((release) => { releaseLock = release; });
      resolve(true);
      await held;
    }).catch(reject);
  }) : false;
  let initial;
  try {
    if (create) {
      if (!writable) throw new Error(locks ? '다른 탭에서 이 실험을 수정 중이에요. 그 탭을 닫고 다시 시도해 주세요.'
        : '이 브라우저에서는 측정값을 기록할 수 없어요. 최신 Chrome·Edge에서 열어 주세요.');
      const createdAt = now();
      const date = new Date(createdAt);
      const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      initial = { run: { id, schemaVersion: 2, runRevision: 1,
        name: name || `게이뤼삭 실험 · ${date.getMonth() + 1}월 ${date.getDate()}일 ${time}`, createdAt, updatedAt: createdAt,
        status: 'open', program: structuredClone(program), profile: structuredClone(program.profile), source,
        lastSavedSampleId: 0, lastSavedEventId: 0 }, samples: [], events: [], workspace: null };
    } else {
      initial = await repository.readSnapshot(id);
      if (!initial) throw new Error('이 브라우저에 해당 실험이 없습니다.');
    }
  } catch (error) { releaseLock(); throw error; }

  let run = structuredClone(initial.run);
  delete run.segments; // Obsolete metadata is ignored when opening older records.
  let samples = structuredClone(initial.samples);
  let events = structuredClone(initial.events);
  let workspace = structuredClone(initial.workspace);
  let saved = { sampleId: run.lastSavedSampleId, eventId: run.lastSavedEventId ?? 0,
    runRevision: create ? 0 : run.runRevision, workspaceRevision: workspace?.workspaceRevision ?? 0 };
  let lastSampleId = samples.at(-1)?.sampleId ?? 0;
  let lastEventId = events.at(-1)?.eventId ?? 0;
  const editedEvents = new Map();
  let eventsVersion = 0;
  let timer = null, saving = null, error = null, closed = false, removing = false, retryBatch = null;
  const dirty = () => lastSampleId > saved.sampleId || lastEventId > saved.eventId
    || run.runRevision > saved.runRevision || (workspace?.workspaceRevision ?? 0) > saved.workspaceRevision;
  const assertWriter = () => { if (!writable || closed || removing) throw new Error('이 실험은 읽기 전용입니다.'); };
  function getState() {
    return { id, name: run.name, source: run.source, writable: writable && !closed, runStatus: run.status,
      status: saving ? 'saving' : error ? 'error' : dirty() ? 'pending' : 'clean',
      error: error?.message ?? '', sampleCount: samples.length, eventCount: events.length, eventsVersion,
      pendingSamples: lastSampleId - saved.sampleId,
      pendingEvents: lastEventId - saved.eventId + [...editedEvents.keys()].filter(eventId => eventId <= saved.eventId).length,
      lastSampleId, lastEventId, savedSampleId: saved.sampleId, runRevision: run.runRevision };
  }
  const emit = () => onChange(getState());
  function schedule() {
    if (!closed && writable && dirty() && !error && timer === null) {
      timer = timers.setTimeout(() => { timer = null; void flush().catch(() => {}); }, saveDelay);
    }
  }
  function changed() { run.runRevision++; run.updatedAt = now(); schedule(); emit(); }
  function updateRun(patch) {
    assertWriter();
    if ('name' in patch) {
      if (typeof patch.name !== 'string' || !patch.name.trim() || patch.name.trim().length > 120)
        throw new Error('실험 이름을 1~120자로 입력해 주세요.');
      patch = { ...patch, name: patch.name.trim() };
    }
    for (const key of Object.keys(patch)) {
      if (!['name', 'status'].includes(key)) throw new Error(`수정할 수 없는 실험 항목: ${key}`);
    }
    run = { ...run, ...structuredClone(patch) }; changed();
  }
  function appendSample(sample) {
    assertWriter();
    if (sample.sampleId !== lastSampleId + 1) throw new Error('샘플 ID는 순서대로 증가해야 합니다.');
    samples.push({ ...structuredClone(sample), runId: id }); lastSampleId = sample.sampleId; changed();
  }
  function appendEvent(event) {
    assertWriter();
    const record = { ...structuredClone(event), runId: id, eventId: ++lastEventId };
    events.push(record); eventsVersion++; changed(); return record.eventId;
  }
  function updateEventNote(eventId, note) {
    assertWriter();
    const index = events.findIndex(event => event.eventId === eventId);
    const next = withEventNote(events[index], note);
    if ((events[index].payload.note ?? '') === next.payload.note) return;
    events[index] = next;
    editedEvents.set(eventId, run.runRevision + 1);
    eventsVersion++; changed();
  }
  function saveWorkspace(next) {
    assertWriter();
    if (next.workspaceRevision <= (workspace?.workspaceRevision ?? 0)) throw new Error('작업 버전은 증가해야 합니다.');
    workspace = { ...structuredClone(next), runId: id }; changed();
  }
  async function saveBatch() {
    const batch = retryBatch ?? { run: { ...structuredClone(run), lastSavedSampleId: lastSampleId, lastSavedEventId: lastEventId },
      samples: structuredClone(samples.filter((s) => s.sampleId > saved.sampleId)),
      events: structuredClone(events.filter((e) => e.eventId > saved.eventId || editedEvents.has(e.eventId))),
      workspace: (workspace?.workspaceRevision ?? 0) > saved.workspaceRevision ? structuredClone(workspace) : null,
      baseRunRevision: saved.runRevision };
    retryBatch = batch;
    try {
      const ack = await repository.commitBatch(batch);
      saved = { ...ack, workspaceRevision: ack.workspaceRevision ?? saved.workspaceRevision };
      for (const [eventId, revision] of editedEvents) if (revision <= saved.runRevision) editedEvents.delete(eventId);
      run.lastSavedSampleId = saved.sampleId; run.lastSavedEventId = saved.eventId;
      error = null; retryBatch = null;
    } catch (failure) { error = failure; throw failure; }
  }
  async function flush() {
    if (!writable || closed) return;
    timers.clearTimeout(timer); timer = null;
    const target = { sampleId: lastSampleId, eventId: lastEventId, runRevision: run.runRevision,
      workspaceRevision: workspace?.workspaceRevision ?? 0 };
    const reached = () => Object.keys(target).every((key) => saved[key] >= target[key]);
    while (!reached()) {
      if (!saving) {
        saving = saveBatch().finally(() => { saving = null; emit(); schedule(); });
        emit();
      }
      await saving;
    }
  }
  function getSnapshot() {
    // Copy synchronously at one boundary. Saves and later inputs cannot alter this snapshot.
    return structuredClone({ run, samples, events, workspace });
  }
  async function close() {
    if (writable) await flush();
    dispose(); await lockTask;
  }
  async function remove() {
    assertWriter();
    if (saving || dirty()) throw new Error('아직 저장 중인 자료가 있어요. 저장을 마친 뒤 삭제해 주세요.');
    // Keep the writer lock until the entire deletion transaction finishes.
    removing = true;
    try { await repository.deleteRun(id); dispose(); await lockTask; }
    finally { removing = false; }
  }
  function dispose() { closed = true; timers.clearTimeout(timer); timer = null; releaseLock(); }
  schedule();
  return { getState, getSnapshot, getRun: () => structuredClone(run),
    getEvents: (limit = 15) => structuredClone(events.slice(-limit)),
    getSamples: () => structuredClone(samples),
    getLatestSample: () => structuredClone(samples.at(-1) ?? null),
    updateRun, appendSample, appendEvent, updateEventNote, saveWorkspace, flush, close, dispose, remove };
}
