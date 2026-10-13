import { createRepository } from '../data/repository.js';
import { openRunStore } from '../data/run-store.js';
import { createSession } from '../measurement/session.js';
import { PROGRAM } from '../program-config.js';
import { decode } from '../measurement/decoder.js';
import { createWorkspace } from '../analysis/workspace.js';
import { buildExperimentJson, parseExperimentJson, buildAnalysisCsv, parseExperimentCsv } from '../data/files.js';
import { importRun } from '../data/import-run.js';
import { createAnalysisChart, exportAnalysisPng } from '../ui/chart-view.js';
import { createReflectionPrint } from '../ui/reflection-view.js';
import { createActionHelp } from '../ui/action-help.js';

const timers = { setTimeout: () => 1, clearTimeout() {} };
const check = (condition, message) => { if (!condition) throw new Error(message); };
const at = 1700000000000;
const reading = ms => ({ ...decode(`${25 + ms / 20000},0,${1000 + ms / 6000}`, PROGRAM.profile),
  attemptId: 1, receivedAt: at + ms, monotonicAt: ms });

async function checkChartResize(report) {
  const host = document.createElement('div'), canvas = document.createElement('canvas');
  host.style.cssText = 'position:relative;width:320px;height:240px';
  host.append(canvas); document.body.append(host);
  let draws = 0, updates = 0, disposed = false;
  const probePlugin = { id: 'layout-transition-probe',
    afterDraw(chart) { if (chart.canvas === canvas) draws++; },
    afterUpdate(chart) { if (chart.canvas === canvas) updates++; } };
  globalThis.Chart.register(probePlugin);
  const view = createAnalysisChart(canvas);
  const model = { type: 'scatter', xLabel: '온도', yLabel: '압력', xColumnId: 'temperatureC',
    points: Array.from({ length: 4000 }, (_, i) => ({ x: i / 100, y: 1000 + i / 30, sampleId: i + 1 })), excludedPoints: [] };
  view.render(model);
  const changeWidth = (width, verify) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { probe.disconnect(); reject(new Error('그래프 크기 변경 시간 초과')); }, 2000);
    const probe = new ResizeObserver(() => {
      if (host.clientWidth !== width) return;
      probe.disconnect(); clearTimeout(timeout);
      try { verify(); resolve(); } catch (error) { reject(error); }
    });
    probe.observe(host); host.style.width = width + 'px';
  });
  try {
    for (const width of [620, 410, 280, 700]) {
      await changeWidth(width, () => check(parseFloat(canvas.style.width) === width && parseFloat(canvas.style.height) === 240,
        '영역 변경과 같은 프레임에서 산점도 크기를 갱신해야 합니다.'));
    }
    view.beginLayoutTransition();
    const captured = host.querySelector('.chart-layout-preview'), initialDraws = draws, initialUpdates = updates;
    check(captured && canvas.style.opacity === '0', '전환 이미지 생성 실패');
    for (const width of [410, 620, 300, 520]) {
      view.beginLayoutTransition(); // A reversal must reuse the existing capture.
      view.render({ ...model, xLabel: '바뀐 축' }, [1]);
      await changeWidth(width, () => {
        check(draws === initialDraws && updates === initialUpdates, '전환 도중 차트 전체를 다시 계산하거나 그림');
        check(host.querySelectorAll('.chart-layout-preview').length === 1 && host.querySelector('.chart-layout-preview') === captured,
          '연속 전환 때 이미지가 중복 생성됨');
        check(Math.abs(captured.getBoundingClientRect().width - width) < 1, '전환 이미지의 너비 동기화 실패');
      });
    }
    view.endLayoutTransition();
    check(!host.querySelector('.chart-layout-preview') && canvas.style.opacity === '' && parseFloat(canvas.style.width) === 520,
      '전환 완료 뒤 실제 그래프 복원 실패');
    check(updates === initialUpdates + 1 && draws === initialDraws + 1, '전환 완료 시 한 번만 갱신해야 함');
    check(globalThis.Chart.getChart(canvas).options.scales.x.title.text === '바뀐 축', '전환 도중 최신 표시 상태 유실');
    view.beginLayoutTransition(); view.dispose(); disposed = true;
    check(!host.querySelector('.chart-layout-preview') && canvas.style.opacity === '', '전환 중 화면 해제 시 이미지 정리 실패');
    report('통과: 4,000점 크기 동기화·전환 중 재계산/그리기 0회·완료 시 1회·연속 전환/최신 상태/해제');
  } finally { if (!disposed) view.dispose(); globalThis.Chart.unregister(probePlugin); host.remove(); }
}

async function checkActionHelp(report) {
  const fixture = document.createElement('section'), previousFocus = document.activeElement;
  fixture.setAttribute('aria-label', '기능 도움말 검사');
  fixture.innerHTML = `<form><div data-actions>
    <span id="help-fixture-description">기존 설명</span>
    <button class="help-trigger" data-action-help="exclude" aria-describedby="help-fixture-description">?</button>
    <button class="help-trigger" data-action-help="extend">?</button>
    </div></form><button type="button" data-outside>다른 기능</button>
    <dialog><form><input aria-label="작성 중인 메모" value="작성 중인 글">
    <button type="button" class="help-trigger" data-action-help="exclude">?</button></form></dialog>`;
  document.body.append(fixture);
  const [first, second, modalHelp] = fixture.querySelectorAll('[data-action-help]');
  const actions = fixture.querySelector('[data-actions]'), outside = fixture.querySelector('[data-outside]');
  const dialog = fixture.querySelector('dialog'), note = dialog.querySelector('input');
  let actionCount = 0, submitCount = 0, escaped = 0, helper;
  actions.addEventListener('click', () => actionCount++);
  fixture.addEventListener('submit', event => { event.preventDefault(); submitCount++; });
  fixture.addEventListener('keydown', event => { if (event.key === 'Escape') escaped++; });
  const messages = {
    exclude: { label: '분석에서 제외', text: '원자료를 보존하고 분석에서만 제외합니다.' },
    extend: { label: '추세선 연장', text: '측정 범위 밖의 추정입니다.' },
  };
  const openPanels = () => [...document.querySelectorAll('[role="tooltip"]:popover-open')];
  const settle = () => new Promise(resolve => requestAnimationFrame(resolve));
  const escape = target => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  try {
    helper = createActionHelp(fixture, { messages });
    first.click();
    check(openPanels().length === 1 && openPanels()[0].textContent === messages.exclude.text,
      '클릭으로 도움말 열기 실패');
    check(first.getAttribute('aria-describedby').split(/\s+/).includes('help-fixture-description')
      && first.getAttribute('aria-describedby').split(/\s+/).includes(openPanels()[0].id), '기존 설명과 도움말 연결 실패');
    first.click();
    check(!openPanels().length, '도움말 재클릭 닫기 실패');
    first.click(); outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    check(!openPanels().length && actionCount === 0 && submitCount === 0,
      '바깥 클릭 닫기 또는 도움말 클릭의 분석 행동·폼 제출 차단 실패');
    report('통과: 도움말 클릭·재클릭·바깥 닫기, 기존 설명 연결, 분석 행동·폼 제출 차단');

    first.focus();
    check(openPanels().length === 1 && document.activeElement === first
      && first.getAttribute('aria-label').includes('분석에서 제외'), '키보드 초점의 도움말·접근 가능한 이름 실패');
    second.focus();
    check(openPanels().length === 1 && openPanels()[0].textContent === messages.extend.text
      && first.getAttribute('aria-expanded') === 'false', '다른 도움말로 이동 시 하나만 표시 실패');
    escape(second);
    check(!openPanels().length && document.activeElement === second && escaped === 0,
      'Esc가 도움말만 닫고 초점·부모 행동을 보존하지 못함');
    outside.focus();
    first.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    check(openPanels().length === 1, '마우스 올림으로 도움말 열기 실패');
    escape(first);
    report('통과: 키보드 초점·마우스 도움말, 한 개 표시, Esc 닫기·초점 유지·부모 행동 차단');

    for (const attribute of ['hidden', 'inert']) {
      first.click(); actions.setAttribute(attribute, ''); await settle();
      check(!openPanels().length, attribute + ' 영역의 열린 도움말이 남음');
      first.click();
      check(!openPanels().length, attribute + ' 영역에서 도움말이 열림');
      actions.removeAttribute(attribute); await settle();
    }
    // Conditional actions hide their adjacent help with the shared wrapper style.
    const conditional = document.createElement('button'); conditional.type = 'button';
    actions.className = 'help-action'; actions.prepend(conditional);
    first.click(); conditional.hidden = true; await settle();
    check(!openPanels().length, '기능 버튼을 숨긴 뒤 이웃 도움말이 남음');
    conditional.remove(); actions.className = ''; await settle();
    report('통과: 숨겨진 화면·비활성 작업 막대에서 도움말 닫기와 재열기 차단');

    dialog.showModal(); note.focus();
    modalHelp.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'mouse' }));
    modalHelp.click();
    check(openPanels().length === 1 && dialog.contains(openPanels()[0])
      && document.activeElement === note && note.value === '작성 중인 글', '모달 도움말의 표시·작성 초점 보존 실패');
    escape(note);
    check(dialog.open && !openPanels().length && escaped === 0 && submitCount === 0,
      '도움말 Esc가 모달 또는 작성 동작에 영향을 줌');
    modalHelp.click(); dialog.close(); await settle();
    check(!openPanels().length, '닫힌 모달의 도움말이 남음');
    report('통과: 모달 내부 도움말·작성 초점 보존, Esc와 모달 닫기의 분리');

    first.click(); const panel = openPanels()[0];
    check(Boolean(panel), '해제 전 도움말 열기 실패');
    helper.dispose();
    check(!panel.isConnected && first.getAttribute('aria-describedby') === 'help-fixture-description'
      && !first.hasAttribute('aria-expanded') && !first.hasAttribute('aria-label') && !first.hasAttribute('type'),
    '도움말 해제 후 표시 요소·기존 접근성 속성 복원 실패');
    outside.focus(); first.focus();
    check(!openPanels().length, '도움말 해제 뒤 이벤트가 남음');
    report('통과: 도움말 해제 시 팝업·이벤트 정리와 기존 속성 복원');
  } finally {
    helper?.dispose(); if (dialog.open) dialog.close(); fixture.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
}

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
    await checkActionHelp(report);
    await checkChartResize(report);
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
    rangeWork.captureReflection();
    rangeWork.setReflectionAnswers({ observation: '나의 관찰 <b>그대로</b>', reasoning: '측정값을 근거로 설명\n두 번째 줄', limitations: '' });
    const rangeState = rangeWork.getState(), captured = JSON.stringify(rangeWork.getReflectionModel());
    rangeWork.applyScope('all'); rangeWork.setGraph({ xColumnId: 'receivedAt', yColumnId: 'pressureHpa', type: 'line' });
    await csvStore.flush();
    const rangeRead = await repo.readSnapshot(csvStore.getState().id);
    check(JSON.stringify(rangeRead.workspace.reflection) === JSON.stringify(rangeState.reflection), '근거와 글 저장 실패');
    const rangeJson = parseExperimentJson(buildExperimentJson(rangeRead));
    const restoredReflection = createWorkspace({ store: { getSnapshot: () => rangeJson, getState: () => ({ writable: false }) } });
    check(JSON.stringify(restoredReflection.getReflectionModel()) === captured && restoredReflection.reflectionChanged(), '보관한 근거의 재열기 실패');
    report('통과: 시간 구간·독립 근거 그래프·작성 글의 실제 DB 저장·JSON 복원·분석 변경 감지');
    const sheet = createReflectionPrint({ name: '<script>실험 이름</script>', model: restoredReflection.getReflectionModel(),
      evidence: rangeState.reflection.evidence, answers: rangeState.reflection.answers, origin: rangeSamples[0].receivedAt });
    const printImage = sheet.querySelector('img'); await printImage.decode();
    check(sheet.querySelectorAll('section').length === 3 && !sheet.querySelector('script') && !sheet.querySelector('b')
      && sheet.textContent.includes('나의 관찰 <b>그대로</b>') && printImage.naturalWidth === 1200, '인쇄 기록의 글·그래프·안전한 텍스트 출력 실패');
    sheet.style.cssText = 'background:white;padding:24px;margin-top:24px;border:1px solid #ddd';
    printImage.style.maxWidth = '100%'; document.getElementById('export-preview').append(sheet);
    report('통과: 근거 그래프와 세 답변의 인쇄 기록 생성·PNG·줄바꿈·HTML을 일반 글로 표시');
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
