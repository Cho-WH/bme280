import { createRepository } from '../data/repository.js';
import { openRunStore } from '../data/run-store.js';
import { createSession } from '../measurement/session.js';
import { PROGRAM } from '../program-config.js';
import { decode } from '../measurement/decoder.js';
import { createWorkspace } from '../analysis/workspace.js';
import { buildExperimentJson, parseExperimentJson, buildAnalysisCsv, parseExperimentCsv } from '../data/files.js';
import { importRun } from '../data/import-run.js';
import { exportAnalysisPng } from '../ui/chart-view.js';

const timers = { setTimeout: () => 1, clearTimeout() {} };
const check = (condition, message) => { if (!condition) throw new Error(message); };
const at = 1700000000000;
const reading = ms => ({ ...decode(`${25 + ms / 20000},0,${1000 + ms / 6000}`, PROGRAM.profile),
  attemptId: 1, receivedAt: at + ms, monotonicAt: ms });
async function checkLegacyUpgrade() {
  const name = 'bme280.gay-lussac.tests.upgrade.' + crypto.randomUUID();
  const repo = createRepository({ databaseName: name });
  const sample = { runId: 'legacy', sampleId: 1, receivedAt: at, temperatureC: 25, pressureHpa: 1000,
    validity: { temperatureC: 'valid', pressureHpa: 'valid' }, segmentId: 1, segmentElapsedMs: 0 };
  let db;
  try {
    db = await globalThis.idb.openDB(name, 1, { upgrade(db) {
      db.createObjectStore('runs', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
      const samples = db.createObjectStore('samples', { keyPath: ['runId', 'sampleId'] });
      samples.createIndex('runId', 'runId');
      samples.createIndex('runSegment', ['runId', 'segmentId']);
      db.createObjectStore('events', { keyPath: ['runId', 'eventId'] }).createIndex('runId', 'runId');
      db.createObjectStore('workspaces', { keyPath: 'runId' });
    } });
    await db.put('runs', { id: 'legacy', runRevision: 1, lastSavedSampleId: 1, lastSavedEventId: 0 });
    await db.put('samples', sample);
    db.close();
    const snapshot = await repo.readSnapshot('legacy');
    check(JSON.stringify(snapshot.samples[0]) === JSON.stringify(sample), '이전 원자료 변경');
    db = await globalThis.idb.openDB(name);
    check(db.version === 2 && !db.transaction('samples').store.indexNames.contains('runSegment'), '구간 인덱스 제거 실패');
  } finally {
    db?.close(); repo.close();
    await globalThis.idb.deleteDB(name);
  }
}

document.getElementById('test').addEventListener('click', async () => {
  const list = document.getElementById('results'); list.replaceChildren();
  document.getElementById('export-preview').replaceChildren();
  const report = text => { const li = document.createElement('li'); li.textContent = text; list.append(li); };
  const repo = createRepository({ databaseName: 'bme280.gay-lussac.tests' });
  let store, reader, reopened, csvStore;
  try {
    await checkLegacyUpgrade();
    report('통과: DB v1→v2 갱신 시 구간 인덱스 제거·기존 원자료 보존');
    store = await openRunStore({ repository: repo, create: true, program: PROGRAM, source: 'replay', timers });
    const session = createSession({ store }); session.acceptInput(reading(0)); await store.flush();
    const snapshot = await repo.readSnapshot(store.getState().id);
    check(snapshot.samples.length === 1 && snapshot.run.lastSavedSampleId === 1, '트랜잭션 저장 위치 불일치');
    report('통과: 원자료·사건·메타데이터를 같은 트랜잭션에서 저장');
    const batch = { run: snapshot.run, samples: snapshot.samples, events: snapshot.events, workspace: null,
      baseRunRevision: 0 };
    await repo.commitBatch(batch);
    check((await repo.readSnapshot(snapshot.run.id)).samples.length === 1, '재시도 중복');
    report('통과: 동일 묶음 재시도에 중복 없음');
    let rejected = false;
    try { await repo.commitBatch({ ...batch, baseRunRevision: snapshot.run.runRevision,
      run: { ...snapshot.run, runRevision: snapshot.run.runRevision + 1, lastSavedSampleId: 2 },
      samples: [{ ...snapshot.samples[0], sampleId: 2 }, { ...snapshot.samples[0], pressureHpa: 900 }] }); }
    catch { rejected = true; }
    const after = await repo.readSnapshot(snapshot.run.id);
    check(rejected && after.samples.length === 1 && after.run.runRevision === snapshot.run.runRevision, '원자료 충돌 시 전체 rollback 실패');
    report('통과: 원자료 충돌 시 묶음 전체 취소, 기존 값 보존');
    reader = await openRunStore({ repository: repo, id: snapshot.run.id, timers });
    check(!reader.getState().writable, '두 번째 작성자 차단 실패');
    report('통과: 같은 실험의 두 번째 작성자는 읽기 전용');
    await reader.close(); await store.close();
    reopened = await openRunStore({ repository: repo, id: snapshot.run.id, timers });
    check(reopened.getState().writable, '잠금 해제 후 재획득 실패');
    const next = createSession({ store: reopened }); next.acceptInput(reading(500)); await next.finish();
    const final = await repo.readSnapshot(snapshot.run.id);
    check(final.samples[1].sampleId === 2 && final.samples[1].receivedAt === at + 500 && final.run.status === 'complete', '재개 또는 종료 저장 실패');
    report('통과: 재개 시각·샘플 ID·종료 상태 복원');
    next.startAdditional({ conditions: { container: 'same', seal: 'same', sensor: 'same' } });
    next.acceptInput(reading(1000)); await next.pause(); next.acceptInput(reading(1500));
    const paused = await repo.readSnapshot(snapshot.run.id);
    check(paused.run.status === 'paused' && paused.samples.length === 3, '일시정지 중 자료가 기록됨');
    await reopened.close();
    reopened = await openRunStore({ repository: repo, id: snapshot.run.id, timers });
    const restored = createSession({ store: reopened }); restored.acceptInput(reading(2000));
    check(restored.getState().state === 'paused' && reopened.getState().sampleCount === 3, '일시정지 복원 실패');
    restored.resume(); restored.acceptInput(reading(2500)); await restored.finish();
    const continued = await repo.readSnapshot(snapshot.run.id);
    check(continued.samples.length === 4 && continued.samples[3].receivedAt === at + 2500
      && continued.events.some(e => e.type === 'additional-measurement' && e.payload.previousLastSampleId === 2), '추가 측정 조건·수신 시각 보존 실패');
    report('통과: 추가 측정 조건 저장·일시정지 복원·미리보기 제외·시각 보존');
    const notedEvent = continued.events.find(e => e.type === 'additional-measurement');
    reopened.updateEventNote(notedEvent.eventId, '센서 위치 확인 후 추가 측정'); await reopened.flush();
    const noteSaved = await repo.readSnapshot(snapshot.run.id);
    check(noteSaved.events.length === continued.events.length
      && noteSaved.events.find(e => e.eventId === notedEvent.eventId).payload.note === '센서 위치 확인 후 추가 측정', '메모 저장 실패');
    for (const changedEvent of [
      { ...noteSaved.events.find(e => e.eventId === notedEvent.eventId), receivedAt: at + 1 },
      { ...noteSaved.events.find(e => e.source === 'system'), payload: { note: '수정 불가' } },
    ]) {
      let blocked = false;
      try { await repo.commitBatch({ run: { ...noteSaved.run, runRevision: noteSaved.run.runRevision + 1 },
        samples: [], events: [changedEvent], workspace: null, baseRunRevision: noteSaved.run.runRevision }); }
      catch { blocked = true; }
      check(blocked && JSON.stringify(await repo.readSnapshot(snapshot.run.id)) === JSON.stringify(noteSaved), '시각·자동 기록 변경 차단 실패');
    }
    check(JSON.stringify(noteSaved.samples) === JSON.stringify(continued.samples), '메모 수정 중 원자료 변경');
    report('통과: 사용자 메모 저장·시각/자동 기록 수정 차단·원자료 보존');
    const workspace = createWorkspace({ store: reopened });
    workspace.setSelection([1, 3]); workspace.applyScope('selection');
    check(workspace.getState().selectedIds.length === 0, '범위 적용 후 체크 해제 실패');
    workspace.setSelection([3]); workspace.exclude(workspace.getState().selectedIds, '장치 이동');
    workspace.setFilter({ ranges: { sampleId: { min: 1, max: 2 } } });
    const calculationDraft = workspace.preparePreset('ratio');
    workspace.saveColumn(calculationDraft.at(-1), calculationDraft.slice(0, -1));
    const [kelvin, ratio] = workspace.getState().calculatedColumns;
    workspace.saveColumn({ ...kelvin, unit: null });
    workspace.setSort(ratio.id);
    workspace.setFilter({ ranges: { sampleId: { min: 1, max: 2 }, [kelvin.id]: { min: 298 } } });
    workspace.setGraph({ xColumnId: kelvin.id, yColumnId: 'pressureHpa', type: 'scatter' });
    workspace.setTrendEnabled(true);
    await reopened.flush();
    const work = workspace.getState();
    await reopened.close();
    reopened = await openRunStore({ repository: repo, id: snapshot.run.id, timers });
    const workRestored = createWorkspace({ store: reopened });
    check(reopened.getEvents(100).find(e => e.eventId === notedEvent.eventId).payload.note === '센서 위치 확인 후 추가 측정', '메모 재열기 실패');
    check(JSON.stringify(workRestored.getState()) === JSON.stringify(work), '분석 작업 복원 불일치');
    check(workRestored.getSummary().candidateCount === 2 && workRestored.getSummary().includedCount === 1, '분석 적용·제외 범위 변경');
    check(workRestored.getState().selectedIds.length === 0, '제외 명령의 체크 해제 저장 실패');
    check(workRestored.getState().calculatedColumns[0].unit === null
      && workRestored.getRows().find(s => s.sampleId === 1).calculations[ratio.id].value === 1000 / 298.15,
    '계산 정의·선택 단위·연관 계산·열 필터/정렬 복원 실패');
    check(!('calculations' in (await repo.readSnapshot(snapshot.run.id)).samples[0]), '원자료에 계산 결과가 저장됨');
    check(workRestored.getGraphData().points.length === 1 && workRestored.getGraphData().excludedPoints.length === 1
      && workRestored.getState().graph.xColumnId === kelvin.id, '그래프 축 저장·제외 자료 복원 실패');
    report('통과: 계산 열·단위 생략·연관 계산·열 필터/정렬·그래프 축 저장·재열기, 원자료 불변');
    workRestored.setSelection([3]); workRestored.restore(workRestored.getState().selectedIds); await reopened.flush();
    const restoredWork = await repo.readSnapshot(snapshot.run.id);
    check(restoredWork.workspace.exclusions.length === 0 && restoredWork.workspace.selectedIds.length === 0
      && restoredWork.workspace.appliedIds.length === 2 && restoredWork.samples.length === 4, '복원·체크 해제 저장 또는 원자료 보존 실패');
    report('통과: 표 범위·필터 저장·재열기, 제외·복원과 체크 해제의 동시 저장, 원자료 보존');
    check(workRestored.getState().regression.enabled && workRestored.getState().regression.result.count === 2
      && workRestored.getState().regression.result.reason === null, '추세선 자동 회복 실패');
    workRestored.setGraphView('extended'); await reopened.flush(); await reopened.close();
    reopened = await openRunStore({ repository: repo, id: snapshot.run.id, timers });
    const trendRestored = createWorkspace({ store: reopened });
    check(trendRestored.getState().regression.enabled && trendRestored.getGraphData().trend.intercept.length === 1
      && trendRestored.getState().graph.view === 'extended', '추세선 토글·연장 보기 재열기 실패');
    check(trendRestored.getState().regression.inputRevision === trendRestored.getState().analysisInputRevision, '오래된 회귀 결과 표시');
    report('통과: 추세선 켜짐·계산 불가 복원·사용 자료 복원 후 자동 계산·연장 보기 저장과 재열기');
    const exported = parseExperimentJson(buildExperimentJson(reopened.getSnapshot()));
    const importedId = await importRun({ repository: repo, snapshot: exported });
    const imported = await repo.readSnapshot(importedId);
    check(imported.events.find(e => e.eventId === notedEvent.eventId).payload.note === '센서 위치 확인 후 추가 측정', 'JSON 메모 복원 실패');
    check(importedId !== exported.run.id && imported.samples.length === exported.samples.length
      && imported.events.length === exported.events.length && imported.workspace.runId === importedId, 'JSON 충돌 ID·원자료 복원 실패');
    check((await repo.readSnapshot(exported.run.id)).run.source !== 'import', '기존 실험을 덮어씀');
    let collision = false;
    try { await repo.commitBatch({ ...imported, baseRunRevision: imported.run.runRevision, insertOnly: true }); }
    catch { collision = true; }
    check(collision && (await repo.readSnapshot(importedId)).samples.length === exported.samples.length, '가져오기 중복 ID 차단 실패');
    const restoredImport = createWorkspace({ store: { getSnapshot: () => imported, getState: () => ({ writable: false }) } });
    check(restoredImport.getGraphData().trend.intercept.length === 1
      && restoredImport.getState().regression.result.count === trendRestored.getState().regression.result.count, 'JSON 회귀 재계산 실패');
    report('통과: 전체 실험 JSON 왕복·ID 충돌 시 새 실험 저장·기존 실험 보존·추세선 재계산');
    const csv = parseExperimentCsv(buildAnalysisCsv(reopened.getSnapshot()), { filename: '재생 검증 · 분석 CSV.csv' });
    const csvId = await importRun({ repository: repo, snapshot: csv });
    csvStore = await openRunStore({ repository: repo, id: csvId, timers });
    const csvWork = createWorkspace({ store: csvStore }), importedColumn = csvWork.getImportedColumns()[0];
    check(csvWork.getState().calculatedColumns.length === 0 && csvWork.getState().exclusions.length === 0
      && csvWork.getLoadedCount() === 2, 'CSV에서 없는 계산식·제외 상태를 추정함');
    csvWork.saveColumn({ id: 'calc-import', name: '가져온 값 + 1', unit: null,
      lhs: { kind: 'column', columnId: importedColumn.id }, op: '+', rhs: { kind: 'constant', value: 1 } });
    csvWork.setGraph({ xColumnId: importedColumn.id, yColumnId: 'calc-import', type: 'scatter' });
    csvWork.setTrendEnabled(true); csvWork.exclude([2], 'CSV 확인');
    await csvStore.flush(); await csvStore.close();
    csvStore = await openRunStore({ repository: repo, id: csvId, timers });
    const csvRestored = createWorkspace({ store: csvStore });
    check(csvRestored.getGraphData().points.length === 1 && csvRestored.getState().exclusions[0].sampleId === 2
      && csvRestored.getRows()[0].calculations['calc-import'].value === csv.samples[0].importedValues[importedColumn.id].value + 1,
    'CSV 고정 열·계산 참조·제외·그래프 재열기 실패');
    const csvJson = parseExperimentJson(buildExperimentJson(csvStore.getSnapshot()));
    check(csvJson.run.importedColumns[0].id === importedColumn.id
      && csvJson.samples[1].sourceSampleId === 3, 'CSV→JSON의 원래 ID·고정 열 보존 실패');
    report('통과: 분석 CSV→새 실험→고정 열로 계산·제외·그래프→저장·재열기·JSON 복원');
    const preview = document.createElement('img'); preview.alt = '내보낸 분석 그래프 PNG';
    preview.src = exportAnalysisPng(restoredImport.getGraphData(), { name: '재생 자료 · PNG 검증' });
    await preview.decode();
    check(preview.naturalWidth === 1200 && preview.naturalHeight > 700, 'PNG 출력 크기 실패');
    preview.style.maxWidth = '100%';
    const jsonLink = document.createElement('a'); jsonLink.textContent = '검증 실험 JSON';
    jsonLink.download = 'gay-lussac-export-check.json';
    jsonLink.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(buildExperimentJson(imported));
    document.getElementById('export-preview').append(jsonLink, preview);
    report('통과: 화면 밖 고정 크기 PNG 생성·축/추세선/회귀식/R² 포함 (아래 이미지 확인)');
    const rangeWork = createWorkspace({ store: csvStore }), rangeSamples = rangeWork.getSamples();
    const selectedTime = rangeSamples[0].receivedAt;
    rangeWork.applyTimeRange({ startAt: selectedTime, endAt: selectedTime });
    rangeWork.setTrendEnabled(true, 'interpretation');
    const rangeState = rangeWork.getState(); await csvStore.flush();
    const rangeRead = await repo.readSnapshot(csvStore.getState().id);
    check(JSON.stringify(rangeRead.workspace.analysisRange) === JSON.stringify(rangeState.analysisRange)
      && rangeRead.workspace.interpretation.enabled === true, '시간 구간·결과 해석 설정 저장 실패');
    const rangeJson = parseExperimentJson(buildExperimentJson(rangeRead));
    check(rangeJson.workspace.appliedIds.length === rangeState.appliedIds.length
      && rangeWork.getGraphData('interpretation').xColumnId === 'temperatureC', '고정 축·JSON 구간 보존 실패');
    report('통과: 시간 구간·고정 축 결과 해석 설정의 실제 DB 저장·JSON 복원');
  } catch (error) { report(`실패: ${error.message}`); }
  finally { store?.dispose(); reader?.dispose(); reopened?.dispose(); csvStore?.dispose(); repo.close(); }
});

document.getElementById('fixture').addEventListener('click', async () => {
  const output = document.getElementById('fixture-result');
  const repo = createRepository(); let store;
  try {
    let ms = 0;
    const count = document.getElementById('fixture-size').valueAsNumber;
    if (!Number.isSafeInteger(count) || count < 40 || count > 20000) throw new Error('40~20,000 사이의 자료 수를 입력하세요.');
    const cutoff = (count - 20) * 100;
    store = await openRunStore({ repository: repo, create: true, program: PROGRAM, source: 'replay',
      name: '재생 검증 자료 · ' + count.toLocaleString() + '개', timers });
    const session = createSession({ store, clock: { utc: () => at + ms, mono: () => ms } });
    session.markEvent('placement');
    for (ms = 0; ms < cutoff; ms += 100) {
      session.acceptInput(reading(ms));
      if (ms === 1000) session.markEvent('heating-start');
      if (ms === 30000) session.markEvent('water-added');
    }
    session.disconnected();
    for (ms = cutoff + 6000; ms < cutoff + 8000; ms += 100) session.acceptInput({ ...reading(ms), attemptId: 2 });
    await store.flush();
    const link = document.createElement('a');
    link.href = `../#/analysis?run=${store.getState().id}`; link.textContent = '앱에서 미완료 재생 자료 열기';
    output.replaceChildren(link);
    await store.close();
  } catch (error) { output.textContent = error.message; }
  finally { store?.dispose(); repo.close(); }
});
