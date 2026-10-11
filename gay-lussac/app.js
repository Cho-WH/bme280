import { PROGRAM } from './program-config.js';
import { STEPS } from './guide/steps.js';
import { createViewerAdapter } from './guide/viewer-adapter.js';
import { createProgrammer } from './guide/programmer-adapter.js';
import { createTransport } from './measurement/transport.js';
import { createReceptionMonitor } from './measurement/reception-monitor.js';
import { createRepository } from './data/repository.js';
import { createChartView } from './ui/chart-view.js';
import { openRunStore } from './data/run-store.js';
import { createSession } from './measurement/session.js';
import { measurementGuidance } from './measurement/guidance.js';
import { buildCsv } from './data/files.js';
import { downloadText } from './ui/download.js';
import { createRawTable, renderEvents } from './ui/run-view.js';
import { createAdditionalDialog } from './ui/additional-dialog.js';

const $ = (id) => document.getElementById(id);
const transport = createTransport();
let monitor = createReceptionMonitor();
const repository = createRepository({ onUnavailable: storageUnavailable });
let screen = 'home';
let stepIndex = 0;
let viewerState = 'loading';
let connection = transport.getState();
let chart;
let lastChartPaint = 0;
let routeRequest = 0;
let runStore = null, session = null, openingRun = null;
let lastEventPaint = -1;
let chartRange = 'recent';
let analysisSnapshot = null;
const LAST_RUN = 'bme280.gay-lussac.last-run';
const rawTable = createRawTable({ body: $('raw-rows'), scroller: $('raw-scroll'), status: $('table-status') });
const additionalDialog = createAdditionalDialog($('additional-dialog'), confirmation => {
  if (!canAddMeasurements()) throw new Error('저장 완료와 작성 권한을 확인한 뒤 다시 시도해 주세요.');
  analysisSnapshot ??= runStore.getSnapshot();
  session ??= createSession({ store: runStore, monitor });
  session.startAdditional(confirmation);
  stepIndex = STEPS.findIndex(step => step.id === 'placement');
  navigate('measure'); renderConnection(connection);
});
const programmer = createProgrammer({ program: PROGRAM, onState: renderProgram,
  beforeFlash: async () => { await transport.disconnect(); },
});
let programState = programmer.getState();

function storageUnavailable(message) {
  $('storage-capability').textContent = message;
  $('saved-status').textContent = message;
}
const viewer = createViewerAdapter($('guide-frame'), (state) => {
  viewerState = state;
  updateViewer();
});
const wiring = [
  ['vcc', '전원', 'V', 'VCC'], ['gnd', '접지', 'G', 'GND'],
  ['scl', '클록', 'CL · P19', 'SCL'], ['sda', '데이터', 'DA · P20', 'SDA'],
];
const table = document.createElement('table');
table.innerHTML = '<caption>확장 보드와 BMP280 연결표</caption><thead><tr><th>역할</th><th>확장 보드</th><th>센서</th></tr></thead><tbody></tbody>';
for (const [wire, ...cells] of wiring) {
  const row = table.tBodies[0].insertRow(); row.dataset.wire = wire;
  cells.forEach((text) => { row.insertCell().textContent = text; });
}
$('fallback-table').append(table);
const stepButtons = [];
for (const [index, label] of ['준비물', '배선', 'USB', '프로그램', '수신', '배터리', '용기'].entries()) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = `${index + 1} ${label}`;
  button.addEventListener('click', () => {
    if (programState.busy) return;
    stepIndex = STEPS.findIndex((step) => step.group === index + 1);
    renderStep(true);
  });
  item.append(button);
  stepButtons.push(button);
  $('guide-progress').append(item);
}
$('program-name').textContent = PROGRAM.fileName;
$('program-version').textContent = `${PROGRAM.version} · 실험 프로그램`;
$('program-verification').textContent = PROGRAM.verification === 'communication-verified'
  ? 'USB 설치와 배터리 전원의 무선 수신을 실물에서 확인한 프로그램이에요.'
  : '현재 프로그램은 실물에서 설치와 센서 수신 확인이 필요해요.';

function renderProgram(next) {
  programState = next;
  $('program-message').textContent = next.message;
  $('program-message').dataset.status = next.status;
  $('program-progress').hidden = next.status !== 'flashing';
  if (next.progress === null) $('program-progress').removeAttribute('value');
  else $('program-progress').value = next.progress;
  $('program-progress-text').textContent = next.status === 'flashing' && next.progress !== null ? `${next.progress}%` : '';
  $('install-program').textContent = next.busy ? (next.status === 'loading' ? '프로그램 준비 중…' : '설치 진행 중…')
    : next.status === 'success' ? '프로그램 다시 설치' : next.status === 'error' ? (next.canInstall ? '다시 설치' : '다시 준비') : 'USB로 프로그램 설치';
  $('program-busy').hidden = !['connecting', 'flashing'].includes(next.status);
  $('skip-program').hidden = next.status === 'success';
  $('skip-program').disabled = next.busy;
  $('previous-step').disabled = stepIndex === 0 || next.busy;
  renderStepNavigation();
  renderConnection(connection);
}

function renderStepNavigation() {
  const group = STEPS[stepIndex].group;
  stepButtons.forEach((button, index) => {
    button.disabled = programState.busy;
    button.classList.toggle('past', index + 1 < group);
    if (index + 1 === group) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
  });
}

function updateViewer() {
  const placement = STEPS[stepIndex].id === 'placement';
  const fallback = $('use-table').checked || viewerState === 'unavailable';
  $('guide-frame').hidden = placement || fallback;
  $('placement-figure').hidden = !placement;
  $('model-fallback').hidden = placement || !fallback;
  $('restore-view').disabled = placement;
  $('use-table').disabled = placement;
  $('viewer-status').textContent = placement ? '센서와 용기 배치'
    : fallback ? '배선 연결표' : viewerState === 'applied' ? '현재 단계의 장치 모습' : '장치 모델을 불러오는 중…';
  for (const row of table.tBodies[0].rows) row.classList.toggle('wire-active', row.dataset.wire === STEPS[stepIndex].model.wire);
}
function renderStep(focus = false) {
  const step = STEPS[stepIndex];
  $('step-counter').textContent = `${String(step.group).padStart(2, '0')} / 07 · ${step.label}`;
  $('step-title').textContent = step.title;
  $('step-description').textContent = step.description;
  $('next-step').textContent = step.action;
  $('previous-step').disabled = stepIndex === 0 || programState.busy;
  $('program-actions').hidden = step.id !== 'program';
  $('reception-check').hidden = !['reception', 'battery'].includes(step.id);
  $('confirm-battery').hidden = step.id !== 'battery';
  $('wiring-note').hidden = step.group !== 2;
  renderStepNavigation();
  updateViewer();
  if (screen === 'prepare' && step.id !== 'placement') viewer.applyStep(step);
  renderReadings();
  if (step.id === 'program' && programState.status === 'idle') void programmer.prepare();
  if (focus) $('step-title').focus({ preventScroll: true });
}

function renderConnection(next) {
  if (next.status === 'disconnected' && connection.status !== 'disconnected') {
    if (session) session.disconnected(); else monitor.disconnected();
  }
  connection = next;
  $('connection-status').textContent = { disconnected: '연결 안 됨', connecting: '연결 중', connected: '연결됨' }[next.status];
  $('connection-status').dataset.active = next.status === 'connected';
  $('device-name').textContent = next.deviceName && next.status === 'connected' ? next.deviceName : '마이크로비트 연결';
  $('connect').disabled = !hasLiveSession() || runStore?.getState().source !== 'device' || !!openingRun || programState.busy || next.busy || next.status !== 'disconnected' || !transport.isSupported() || !isSecureContext;
  if (transport.isSupported() && isSecureContext) $('connection-help').textContent = runStore?.getState().runStatus === 'complete'
    ? '측정을 마친 실험이에요. 위의 추가 측정으로 이어가거나 새 실험을 시작하세요.'
    : runStore?.getState().source === 'replay' ? '재생 검증 자료예요. 실제 장치 기록은 새 실험에서 시작하세요.'
      : session?.getState().state === 'paused' ? '기록 일시정지 중이에요. 연결해도 기록 재개 전에는 현재 값만 표시합니다.'
        : !session ? '이어 측정을 선택한 뒤 장치를 연결해 주세요.' : '전원을 켠 뒤 사용할 장치를 선택하세요.';
  $('install-program').disabled = programState.busy || next.busy || (!programState.canInstall && programState.status !== 'error');
  $('connect').textContent = next.status === 'connecting' ? '장치 연결 중…' : next.status === 'connected' ? '연결됨' : '마이크로비트 연결';
  // A pending chooser/GATT operation must settle before another attempt uses the shared BLE module.
  $('disconnect').disabled = next.status === 'disconnected' || next.busy;
  $('connection-message').textContent = next.message;
  $('connection-message').hidden = !next.message;
  renderReadings();
}

function renderReadings() {
  session?.tick();
  const now = performance.now();
  const snapshot = monitor.getSnapshot(now);
  const fresh = snapshot.reception.state === 'receiving' && connection.status === 'connected';
  const ready = fresh && snapshot.reception.ready;
  $('reception-status').textContent = fresh ? '새 값 수신 중' : snapshot.latest ? '새 값 없음' : '값 대기';
  $('reception-status').dataset.active = fresh;
  $('live-state').textContent = fresh ? '새 값이 들어오고 있어요' : snapshot.latest ? '새 값 수신을 기다려요' : '새 값을 기다려요';
  $('last-received').textContent = snapshot.latest
    ? `마지막 수신 ${new Date(snapshot.latest.receivedAt).toLocaleTimeString('ko-KR')} · ${Math.max(0, Math.floor((now - snapshot.latest.monotonicAt) / 1000))}초 전`
    : '아직 받은 값이 없습니다.';
  $('reading-problem').textContent = snapshot.problem;
  for (const [selector, field, digits] of [['[data-temperature]', 'temperatureC', 2], ['[data-pressure]', 'pressureHpa', 2]]) {
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = snapshot.latest ? snapshot.latest[field].toFixed(digits) : '—';
      element.classList.toggle('stale', !fresh || snapshot.latest?.validity[field] !== 'valid');
    });
  }
  const batteryStep = STEPS[stepIndex].id === 'battery';
  const check = batteryStep ? snapshot.battery : snapshot.reception;
  const confirmed = fresh && check.ready;
  $('check-title').textContent = batteryStep && !snapshot.battery.armed ? 'USB 분리 후 확인을 시작하세요'
    : confirmed ? '새 값 수신을 확인했어요' : '새 값이 이어서 들어오는지 확인 중';
  $('check-detail').textContent = snapshot.problem || (confirmed ? '1초 이상에 걸쳐 새 값 3개 이상을 받았어요.'
    : `${check.count}개 수신 · ${(check.spanMs / 1000).toFixed(1)}초 경과`);
  if (runStore?.getState().runStatus === 'complete') {
    $('check-title').textContent = '측정을 마친 실험이에요';
    $('check-detail').textContent = '위의 추가 측정에서 조건을 확인하면 수신 확인을 다시 할 수 있어요.';
  }
  if (['reception', 'battery'].includes(STEPS[stepIndex].id)) {
    $('step-description').textContent = runStore?.getState().runStatus === 'complete'
      ? '측정을 마친 실험이에요. 추가 측정에서 조건을 확인하거나 새 실험을 시작한 뒤 장치를 연결해 주세요.'
      : STEPS[stepIndex].description;
  }
  $('reception-check').dataset.ready = confirmed;
  $('confirm-battery').disabled = connection.status !== 'connected' || connection.busy;
  $('confirm-battery').textContent = snapshot.battery.armed ? 'USB 분리 시점부터 다시 확인' : '배터리 연결 후 USB를 분리했어요';
  $('next-step').disabled = programState.busy || (STEPS[stepIndex].id === 'program' ? programState.status !== 'success'
    : STEPS[stepIndex].id === 'reception' ? !ready : batteryStep ? !confirmed : false);
  if (screen === 'measure' && chart && now - lastChartPaint >= 1000) {
    const points = chartRange === 'all' && runStore ? runStore.getSamples() : snapshot.points;
    chart.render(points, now, { range: chartRange, events: runStore?.getEvents(100) ?? [] }); lastChartPaint = now;
    $('chart-empty').hidden = points.length > 0;
  }
  renderRecording(ready);
}

async function listSavedRuns() {
  try {
    await repository.open();
    $('storage-capability').textContent = '이 브라우저에 저장 · 다른 기기로 옮길 때는 CSV';
    const runs = await repository.listRuns();
    $('saved-runs').replaceChildren();
    $('saved-status').textContent = runs.length ? `${runs.length}개의 실험이 이 브라우저에 저장되어 있어요.`
      : '저장된 실험이 없습니다. 새 실험을 시작하면 여기에 기록이 남아요.';
    for (const run of runs) {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = `${run.name} · ${run.status === 'complete' ? '측정 완료' : run.status === 'paused' ? '기록 일시정지' : '미완료'} · ${run.lastSavedSampleId}개`;
      const button = document.createElement('button'); button.textContent = '열기';
      button.addEventListener('click', () => { void act(async () => { await openRun(run.id); navigate('analysis'); }); });
      li.append(label, button);
      $('saved-runs').append(li);
    }
  } catch { storageUnavailable('브라우저 저장소를 열지 못했어요. 저장 허용 설정을 확인한 뒤 다시 시도해 주세요.'); }
}

async function route({ focus = true } = {}) {
  const request = ++routeRequest;
  const [path, query = ''] = location.hash.slice(2).split('?');
  screen = ['home', 'prepare', 'measure', 'analysis'].includes(path) ? path : 'home';
  const id = new URLSearchParams(query).get('run');
  try {
    if (id && id !== runStore?.getState().id) await openRun(id);
    if (!runStore && ['prepare', 'measure'].includes(screen)) await openRun(null);
  } catch (error) { showMessage(error.message); }
  if (request !== routeRequest) return;
  // A rejected switch must not leave another experiment's ID in the address bar.
  if (runStore && id !== runStore.getState().id) {
    history.replaceState(null, '', `#/${screen}?run=${encodeURIComponent(runStore.getState().id)}`);
  }
  document.querySelectorAll('[data-screen]').forEach((section) => { section.hidden = section.dataset.screen !== screen; });
  document.querySelectorAll('[data-screen-link]').forEach((link) => {
    if (link.dataset.screenLink === screen) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('connection-tools').hidden = ['home', 'analysis'].includes(screen);
  if (screen === 'prepare') renderStep();
  if (screen === 'measure') {
    try { chart ??= createChartView($('live-chart')); chart.resize(); }
    catch (error) { $('chart-error').hidden = false; $('chart-error').textContent = error.message; }
    renderReadings();
  }
  if (screen === 'home') void listSavedRuns();
  if (screen === 'analysis') renderAnalysis();
  syncRunLinks();
  renderConnection(connection);
  if (focus) document.querySelector(`[data-screen="${screen}"] h1`).focus({ preventScroll: true });
}
function navigate(target) {
  const suffix = runStore ? `?run=${encodeURIComponent(runStore.getState().id)}` : '';
  if (location.hash === `#/${target}${suffix}`) void route();
  else location.hash = `/${target}${suffix}`;
}
function syncRunLinks() {
  const suffix = runStore ? `?run=${encodeURIComponent(runStore.getState().id)}` : '';
  document.querySelectorAll('[data-screen-link]').forEach((link) => { link.href = `#/${link.dataset.screenLink}${suffix}`; });
}
function showMessage(message = '') { $('run-message').textContent = message; }
async function act(action) { try { showMessage(); await action(); } catch (error) { showMessage(error.message); } }
function canRecord() { return !!runStore?.getState().writable && !!session && ['idle', 'collecting'].includes(session.getState().state); }
function hasLiveSession() { return canRecord() || (!!runStore?.getState().writable && session?.getState().state === 'paused'); }
function canAddMeasurements() {
  const saved = runStore?.getState();
  return !!saved?.writable && saved.runStatus === 'complete' && saved.status === 'clean'
    && (!session || session.getState().state === 'ended') && !openingRun && !programState.busy;
}
function onStoreChange() { renderStorage(); }
function renderStorage() {
  if (!runStore) return;
  const saved = runStore.getState();
  // Keep routine batch transitions quiet while recording; failures remain visible.
  const storageLabel = !saved.writable ? '읽기 전용'
    : saved.error || saved.status === 'error' ? '저장 문제'
      : canRecord() ? '자동 저장 중'
        : session?.getState().state === 'paused' && saved.status === 'clean' ? '정지 전 기록 저장됨'
        : { clean: '이 브라우저에 저장됨', pending: '저장 대기', saving: '저장 중' }[saved.status];
  if ($('storage-status').textContent !== storageLabel) $('storage-status').textContent = storageLabel;
  $('storage-status').dataset.error = saved.status === 'error';
  $('storage-problem').hidden = saved.status !== 'error';
  $('storage-detail').textContent = `미저장 측정값 ${saved.pendingSamples}개 · 사건 ${saved.pendingEvents}개. ${saved.error} 현재 탭의 자료는 유지되며 전체 CSV로 보관할 수 있어요.`;
  $('temporary-analysis').hidden = session?.getState().state !== 'finishing';
  $('retry-save').disabled = saved.status === 'saving';
  if (screen === 'analysis') renderAnalysisSummary();
  if (screen === 'analysis' && session?.getState().state === 'finishing') {
    $('analysis-message').textContent = '입력을 마감했어요. 남은 자료를 저장하거나 임시 자료로 분석을 선택해 주세요.';
  }
}
function renderRecording(ready) {
  $('run-tools').hidden = !runStore;
  if (!runStore) return;
  const saved = runStore.getState();
  const live = session?.getState();
  const paused = live?.state === 'paused';
  $('run-phase').textContent = saved.runStatus === 'complete' ? '측정 완료' : paused ? '기록 일시정지' : session ? '측정 중' : '미완료';
  $('paused-notice').hidden = !paused || screen === 'measure';
  $('additional-measurement').hidden = saved.runStatus !== 'complete';
  $('additional-measurement').disabled = !canAddMeasurements();
  $('run-name').textContent = saved.name;
  $('run-summary').textContent = `${saved.sampleCount.toLocaleString()}개 기록 · ${saved.savedSampleId.toLocaleString()}개 저장 완료${!saved.writable ? ' · 다른 탭에서 작성 중이거나 작성 잠금을 사용할 수 없어요.' : ''}`;
  $('export-csv').disabled = saved.sampleCount === 0;
  $('new-run').disabled = !!openingRun;
  $('resume-panel').hidden = !!session || saved.runStatus === 'complete';
  $('resume-message').textContent = saved.writable
    ? '마지막으로 저장된 미완료 기록을 열었어요. 이어 측정하거나 여기까지 분석할 수 있어요.'
    : '이 실험은 읽기 전용이에요. 현재 기록을 보거나 CSV로 보관할 수 있어요. 작성 중인 탭을 닫은 뒤 권한을 다시 확인하세요.';
  $('resume-run').disabled = $('analyze-unfinished').disabled = !saved.writable || !!openingRun;
  $('retry-lock').hidden = saved.writable;
  $('confirm-placement').hidden = !!live?.placed || !canRecord();
  $('heating-start').disabled = !canRecord() || !ready || !live?.placed || live?.heating;
  $('heating-start').textContent = live?.heating ? '가열 시작 기록됨' : '가열 시작';
  $('water-added').disabled = $('device-change').disabled = !hasLiveSession() || !live?.sampleCount;
  $('pause-recording').hidden = saved.runStatus === 'complete';
  $('pause-recording').disabled = !hasLiveSession() || !!openingRun;
  $('pause-recording').textContent = paused ? '기록 재개' : '기록 일시정지';
  $('finish-run').disabled = !session || live.state === 'ended' || !!openingRun;
  $('finish-run').textContent = live?.state === 'finishing' ? '저장 다시 시도' : '측정 마치기';
  $('measurement-guidance').textContent = live ? measurementGuidance(live, ready)
    : saved.runStatus === 'complete' ? '측정을 마친 실험입니다. 자료를 분석하거나 위의 추가 측정으로 기록을 이어가세요.' : '이어 측정을 선택하면 새 수신 구간부터 기록합니다.';
  $('recording-summary').textContent = live ? `${live.segmentCount}개 구간 · 수신 구간 합계 ${Math.floor(live.elapsedMs / 1000)}초` : '';
  if (lastEventPaint !== saved.eventCount) {
    renderEvents($('measure-events'), runStore.getEvents()); lastEventPaint = saved.eventCount;
  }
  renderStorage();
}
function renderAnalysis() {
  const active = session && session.getState().state !== 'ended';
  $('finish-for-analysis').hidden = !active;
  if (!runStore) {
    rawTable.render([]); renderEvents($('analysis-events'), []);
    $('analysis-message').textContent = '저장된 실험을 열거나 먼저 장치를 연결해 주세요.';
    $('apply-new-data').hidden = true;
    return;
  }
  const snapshot = analysisSnapshot ??= runStore.getSnapshot();
  rawTable.render(snapshot.samples); renderEvents($('analysis-events'), runStore.getEvents(), 100);
  renderAnalysisSummary();
}
function renderAnalysisSummary() {
  if (!runStore) return;
  const saved = runStore.getState();
  const snapshot = analysisSnapshot;
  const added = snapshot ? saved.sampleCount - snapshot.samples.length : 0;
  $('analysis-message').textContent = `${(snapshot?.samples.length ?? saved.sampleCount).toLocaleString()}개의 적용 자료 · ${snapshot?.run.segments.length ?? runStore.getRun().segments.length}개 수신 구간${added ? ` · 새 자료 ${added.toLocaleString()}개 — 새 자료 적용을 누르면 포함됩니다.` : ''}${hasLiveSession() ? ' · 화면을 이동해도 기록 상태는 유지돼요.' : ''}${saved.status !== 'clean' ? ' · 미저장 변경 있음' : ''}${saved.source === 'replay' ? ' · 재생 검증 자료' : ''}`;
  $('apply-new-data').hidden = !added;
}
async function openRun(id, { force = false } = {}) {
  if (openingRun) return openingRun;
  if (id && id === runStore?.getState().id && !force) return;
  if (session && session.getState().state !== 'ended') throw new Error('현재 측정을 먼저 마쳐 주세요. 장치 준비와 측정하기는 계속 오갈 수 있어요.');
  if (runStore && runStore.getState().status !== 'clean') throw new Error('미저장 자료가 있어요. 다시 저장한 뒤 실험을 바꿔 주세요.');
  openingRun = (async () => {
    const next = await openRunStore({ repository, ...(id ? { id } : {}), create: !id, program: PROGRAM, onChange: onStoreChange });
    try { await transport.disconnect(); await runStore?.close(); }
    catch (error) { next.dispose(); throw error; }
    runStore = next; session = null; monitor = createReceptionMonitor(); analysisSnapshot = null; lastEventPaint = -1; lastChartPaint = 0;
    chartRange = id ? 'all' : 'recent'; $('chart-range').value = chartRange;
    const run = next.getRun();
    if (!id || (next.getState().writable && run.status === 'paused')) session = createSession({ store: next, monitor });
    else if (next.getState().writable && run.status !== 'complete') {
      const resumedAt = Date.now();
      const samples = next.getSamples();
      next.updateRun({ status: 'interrupted', segments: run.segments.map((s) => s.endedAt !== undefined ? s
        : { ...s, endedAt: samples.filter((sample) => sample.segmentId === s.id).at(-1)?.receivedAt ?? s.startedAt, endReason: 'interrupted' }) });
      next.appendEvent({ type: 'interrupted', receivedAt: resumedAt, segmentId: null, segmentElapsedMs: null, payload: {}, source: 'system' });
    }
    try { localStorage.setItem(LAST_RUN, run.id); } catch { /* DB remains the record store. */ }
    syncRunLinks(); renderReadings();
  })().finally(() => { openingRun = null; renderConnection(connection); });
  return openingRun;
}
async function startGuide(skip) {
  if (!runStore || runStore.getState().runStatus === 'complete') await openRun(null);
  stepIndex = skip ? STEPS.findIndex((step) => step.id === 'reception') : 0;
  navigate('prepare');
}
async function finishAndAnalyze() {
  if (!session) return;
  try {
    await session.finish();
    await transport.disconnect();
    navigate('analysis');
  } finally { renderReadings(); }
}
$('start-guide').addEventListener('click', () => { void act(() => startGuide(false)); });
$('skip-guide').addEventListener('click', () => { void act(() => startGuide(true)); });
$('previous-step').addEventListener('click', () => { stepIndex = Math.max(0, stepIndex - 1); renderStep(true); });
$('next-step').addEventListener('click', () => {
  if (stepIndex < STEPS.length - 1) { stepIndex++; renderStep(true); }
  else { session?.markEvent('placement'); navigate('measure'); }
});
$('restore-view').addEventListener('click', () => { $('use-table').checked = false; viewer.restoreStep(); });
$('use-table').addEventListener('change', updateViewer);
$('connect').addEventListener('click', () => {
  if (!hasLiveSession() || runStore.getState().source !== 'device') return;
  void transport.connect(PROGRAM.profile, (input) => { session?.acceptInput(input); }, renderConnection);
});
$('disconnect').addEventListener('click', () => { void transport.disconnect(); });
$('pause-recording').addEventListener('click', () => { void act(async () => {
  if (!hasLiveSession()) return;
  const pending = session.getState().state === 'paused' ? session.resume() : session.pause();
  renderConnection(connection);
  await pending; renderReadings();
}); });
$('additional-measurement').addEventListener('click', () => { if (canAddMeasurements()) additionalDialog.show(); });
$('apply-new-data').addEventListener('click', () => { analysisSnapshot = runStore.getSnapshot(); renderAnalysis(); });
$('install-program').addEventListener('click', () => {
  if (programState.canInstall) void programmer.install();
  else void programmer.prepare();
});
$('skip-program').addEventListener('click', () => {
  stepIndex = STEPS.findIndex(step => step.id === 'reception'); renderStep(true);
});
$('confirm-battery').addEventListener('click', () => { monitor.confirmBattery(performance.now()); renderReadings(); });
$('open-saved').addEventListener('click', () => { void listSavedRuns(); $('saved-status').scrollIntoView({ block: 'nearest' }); });
$('new-run').addEventListener('click', () => { void act(async () => { await openRun(null); navigate('prepare'); }); });
$('retry-lock').addEventListener('click', () => { void act(async () => {
  const id = runStore.getState().id;
  await openRun(id, { force: true }); renderAnalysis();
}); });
$('resume-run').addEventListener('click', () => { void act(async () => {
  if (session || !runStore?.getState().writable) return;
  monitor = createReceptionMonitor(); session = createSession({ store: runStore, monitor });
  runStore.updateRun({ status: 'open' }); session.markEvent('resumed'); navigate('measure'); renderConnection(connection);
}); });
$('analyze-unfinished').addEventListener('click', () => { void act(async () => {
  if (!runStore?.getState().writable) return;
  session ??= createSession({ store: runStore, monitor }); await finishAndAnalyze();
}); });
for (const id of ['finish-run', 'finish-for-analysis']) $(id).addEventListener('click', () => { void act(finishAndAnalyze); });
$('temporary-analysis').addEventListener('click', () => { void act(async () => {
  session?.useTemporary(); await transport.disconnect(); navigate('analysis');
}); });
$('retry-save').addEventListener('click', () => { void act(async () => {
  if (session?.getState().state === 'finishing') await finishAndAnalyze();
  else { await runStore.flush(); renderReadings(); if (screen === 'analysis') renderAnalysis(); }
}); });
$('export-csv').addEventListener('click', () => { void act(async () => {
  const snapshot = runStore.getSnapshot();
  downloadText(buildCsv(snapshot), `gay-lussac-${snapshot.run.id}.csv`);
  showMessage(`${snapshot.samples.length}개 원자료의 CSV 다운로드를 요청했어요. 조작 기록은 브라우저의 실험에 보존됩니다.`);
}); });
for (const [id, type] of [['confirm-placement', 'placement'], ['heating-start', 'heating-start'], ['water-added', 'water-added']]) {
  $(id).addEventListener('click', () => { session?.markEvent(type); renderReadings(); });
}
$('device-change').addEventListener('click', () => { $('device-form').hidden = false; $('device-kind').focus(); });
$('cancel-device').addEventListener('click', () => { $('device-form').hidden = true; });
$('device-form').addEventListener('submit', (event) => {
  event.preventDefault();
  session?.markEvent('device-change', { kind: $('device-kind').value, note: $('device-note').value.trim() });
  $('device-note').value = ''; $('device-form').hidden = true; renderReadings();
});
$('chart-range').addEventListener('change', () => { chartRange = $('chart-range').value; lastChartPaint = 0; renderReadings(); });
document.querySelectorAll('[data-analysis-pane]').forEach((button) => button.addEventListener('click', () => {
  document.querySelector('.analysis-grid').dataset.activePane = button.dataset.analysisPane;
  document.querySelectorAll('[data-analysis-pane]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
}));
window.addEventListener('hashchange', () => { void route(); });
document.querySelector('.skip-link').addEventListener('click', (event) => { event.preventDefault(); $('main').focus(); });
if (!transport.isSupported() || !isSecureContext) $('connection-help').textContent = '연결하려면 노트북 Chrome·Edge에서 HTTPS 또는 localhost 주소로 열어 주세요.';
renderConnection(connection);
void listSavedRuns();
void (async () => {
  let last;
  try { last = localStorage.getItem(LAST_RUN); } catch { /* Opening by a URL still works. */ }
  if (last && !location.hash.includes('run=')) {
    try { await openRun(last); } catch (error) { showMessage(error.message); }
  }
  await route({ focus: false });
})();
const tick = setInterval(renderReadings, 500);
window.addEventListener('beforeunload', (event) => {
  if (['connecting', 'flashing'].includes(programState.status) || (hasLiveSession() && runStore.getState().sampleCount > 0) || (runStore && runStore.getState().status !== 'clean')) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('pagehide', () => {
  // A hidden screen doesn't end the connection; leaving the document does.
  clearInterval(tick); rawTable.dispose(); runStore?.dispose(); viewer.dispose(); chart?.dispose(); repository.close(); void transport.disconnect(); void programmer.dispose();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) void runStore?.flush().catch(() => {}); });
window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
