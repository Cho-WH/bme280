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
      if (!writable) throw new Error('기록을 시작하려면 작성 잠금을 지원하는 Chrome·Edge에서 열어 주세요.');
      initial = { run: { id, schemaVersion: 1, runRevision: 1,
        name: name || `기체 실험 · ${new Date(now()).toLocaleString('ko-KR')}`, createdAt: now(), updatedAt: now(),
        status: 'open', program: structuredClone(program), profile: structuredClone(program.profile), source,
        segments: [], lastSavedSampleId: 0, lastSavedEventId: 0 }, samples: [], events: [], workspace: null };
    } else {
      initial = await repository.readSnapshot(id);
      if (!initial) throw new Error('이 브라우저에 해당 실험이 없습니다.');
    }
  } catch (error) { releaseLock(); throw error; }

  let run = structuredClone(initial.run);
  let samples = structuredClone(initial.samples);
  let events = structuredClone(initial.events);
  let workspace = structuredClone(initial.workspace);
  let saved = { sampleId: run.lastSavedSampleId, eventId: run.lastSavedEventId ?? 0,
    runRevision: create ? 0 : run.runRevision, workspaceRevision: workspace?.workspaceRevision ?? 0 };
  let lastSampleId = samples.at(-1)?.sampleId ?? 0;
  let lastEventId = events.at(-1)?.eventId ?? 0;
  let timer = null, saving = null, error = null, closed = false, retryBatch = null;
  const dirty = () => lastSampleId > saved.sampleId || lastEventId > saved.eventId
    || run.runRevision > saved.runRevision || (workspace?.workspaceRevision ?? 0) > saved.workspaceRevision;
  const assertWriter = () => { if (!writable || closed) throw new Error('이 실험은 읽기 전용입니다.'); };
  function getState() {
    return { id, name: run.name, source: run.source, writable: writable && !closed, runStatus: run.status,
      status: saving ? 'saving' : error ? 'error' : dirty() ? 'pending' : 'clean',
      error: error?.message ?? '', sampleCount: samples.length, eventCount: events.length,
      pendingSamples: lastSampleId - saved.sampleId, pendingEvents: lastEventId - saved.eventId,
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
    for (const key of Object.keys(patch)) {
      if (!['name', 'status', 'segments'].includes(key)) throw new Error(`수정할 수 없는 실험 항목: ${key}`);
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
    events.push(record); changed(); return record.eventId;
  }
  function saveWorkspace(next) {
    assertWriter();
    if (next.workspaceRevision <= (workspace?.workspaceRevision ?? 0)) throw new Error('작업 버전은 증가해야 합니다.');
    workspace = { ...structuredClone(next), runId: id }; changed();
  }
  async function saveBatch() {
    const batch = retryBatch ?? { run: { ...structuredClone(run), lastSavedSampleId: lastSampleId, lastSavedEventId: lastEventId },
      samples: structuredClone(samples.filter((s) => s.sampleId > saved.sampleId)),
      events: structuredClone(events.filter((e) => e.eventId > saved.eventId)),
      workspace: (workspace?.workspaceRevision ?? 0) > saved.workspaceRevision ? structuredClone(workspace) : null,
      baseRunRevision: saved.runRevision };
    retryBatch = batch;
    try {
      const ack = await repository.commitBatch(batch);
      saved = { ...ack, workspaceRevision: ack.workspaceRevision ?? saved.workspaceRevision };
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
  function dispose() { closed = true; timers.clearTimeout(timer); timer = null; releaseLock(); }
  schedule();
  return { getState, getSnapshot, getRun: () => structuredClone(run),
    getEvents: (limit = 15) => structuredClone(events.slice(-limit)),
    getSamples: () => structuredClone(samples),
    updateRun, appendSample, appendEvent, saveWorkspace, flush, close, dispose };
}
