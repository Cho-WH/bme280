import { PROGRAM } from './program-config.js';
import { STEPS } from './guide/steps.js';
import { createViewerAdapter } from './guide/viewer-adapter.js';
import { createProgrammer } from './guide/programmer-adapter.js';
import { createTransport } from './measurement/transport.js';
import { createReceptionMonitor } from './measurement/reception-monitor.js';
import { createRepository } from './data/repository.js';
import { createChartView } from './ui/chart-view.js';

const $ = (id) => document.getElementById(id);
const transport = createTransport();
const monitor = createReceptionMonitor();
const repository = createRepository({ onUnavailable: storageUnavailable });
let screen = 'home';
let stepIndex = 0;
let viewerState = 'loading';
let connection = transport.getState();
let chart;
let lastChartPaint = 0;
let routeRequest = 0;
const programmer = createProgrammer({ program: PROGRAM, onState: renderProgram,
  beforeFlash: async () => { await transport.disconnect(); monitor.disconnected(); },
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
  if (next.status === 'disconnected' && connection.status !== 'disconnected') monitor.disconnected();
  connection = next;
  $('connection-status').textContent = { disconnected: '연결 안 됨', connecting: '연결 중', connected: '연결됨' }[next.status];
  $('connection-status').dataset.active = next.status === 'connected';
  $('device-name').textContent = next.deviceName && next.status === 'connected' ? next.deviceName : '마이크로비트 연결';
  $('connect').disabled = programState.busy || next.busy || next.status !== 'disconnected' || !transport.isSupported() || !isSecureContext;
  $('install-program').disabled = programState.busy || next.busy || (!programState.canInstall && programState.status !== 'error');
  $('connect').textContent = next.status === 'connecting' ? '장치 연결 중…' : next.status === 'connected' ? '연결됨' : '마이크로비트 연결';
  // A pending chooser/GATT operation must settle before another attempt uses the shared BLE module.
  $('disconnect').disabled = next.status === 'disconnected' || next.busy;
  $('connection-message').textContent = next.message;
  $('connection-message').hidden = !next.message;
  renderReadings();
}

function renderReadings() {
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
  $('reception-check').dataset.ready = confirmed;
  $('confirm-battery').disabled = connection.status !== 'connected' || connection.busy;
  $('confirm-battery').textContent = snapshot.battery.armed ? 'USB 분리 시점부터 다시 확인' : '배터리 연결 후 USB를 분리했어요';
  $('next-step').disabled = programState.busy || (STEPS[stepIndex].id === 'program' ? programState.status !== 'success'
    : STEPS[stepIndex].id === 'reception' ? !ready : batteryStep ? !confirmed : false);
  if (screen === 'measure' && chart && now - lastChartPaint >= 250) {
    chart.render(snapshot.points, now); lastChartPaint = now;
    $('chart-empty').hidden = snapshot.points.length > 0;
  }
}

async function listSavedRuns() {
  try {
    await repository.open();
    $('storage-capability').textContent = '브라우저 저장소 사용 가능 · 기록 저장 준비 중';
    const runs = await repository.listRuns();
    $('saved-runs').replaceChildren();
    $('saved-status').textContent = runs.length ? `${runs.length}개의 실험 정보가 있습니다. 자료 열기는 준비 중이에요.`
      : '저장된 실험이 없습니다. 측정 기록 기능이 연결되면 여기서 이어 열 수 있어요.';
    for (const run of runs) {
      const li = document.createElement('li');
      li.textContent = `${run.name} · ${new Date(run.updatedAt).toLocaleString('ko-KR')}`;
      $('saved-runs').append(li);
    }
  } catch { storageUnavailable('브라우저 저장소를 열지 못했어요. 저장 허용 설정을 확인한 뒤 다시 시도해 주세요.'); }
}

async function route({ focus = true } = {}) {
  const request = ++routeRequest;
  const [path, query = ''] = location.hash.slice(2).split('?');
  screen = ['home', 'prepare', 'measure', 'analysis'].includes(path) ? path : 'home';
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
  if (focus) document.querySelector(`[data-screen="${screen}"] h1`).focus({ preventScroll: true });
  const id = new URLSearchParams(query).get('run');
  $('analysis-message').textContent = '';
  if (screen === 'analysis' && id) {
    try {
      const run = await repository.readRun(id);
      if (request === routeRequest) $('analysis-message').textContent = run
        ? `“${run.name}”의 분석 작업 복원은 준비 중이에요. 저장된 자료는 유지됩니다.` : '이 브라우저에 해당 실험이 없습니다.';
    } catch { if (request === routeRequest) $('analysis-message').textContent = '저장된 실험을 읽을 수 없어요.'; }
  }
}
function navigate(target) {
  if (location.hash === `#/${target}`) void route();
  else location.hash = `/${target}`;
}
$('start-guide').addEventListener('click', () => { stepIndex = 0; navigate('prepare'); });
$('skip-guide').addEventListener('click', () => { stepIndex = STEPS.findIndex((step) => step.id === 'reception'); navigate('prepare'); });
$('previous-step').addEventListener('click', () => { stepIndex = Math.max(0, stepIndex - 1); renderStep(true); });
$('next-step').addEventListener('click', () => {
  if (stepIndex < STEPS.length - 1) { stepIndex++; renderStep(true); }
  else navigate('measure');
});
$('restore-view').addEventListener('click', () => { $('use-table').checked = false; viewer.restoreStep(); });
$('use-table').addEventListener('change', updateViewer);
$('connect').addEventListener('click', () => {
  void transport.connect(PROGRAM.profile, (input) => { monitor.accept(input); renderReadings(); }, renderConnection);
});
$('disconnect').addEventListener('click', () => { void transport.disconnect(); });
$('install-program').addEventListener('click', () => {
  if (programState.canInstall) void programmer.install();
  else void programmer.prepare();
});
$('skip-program').addEventListener('click', () => {
  stepIndex = STEPS.findIndex(step => step.id === 'reception'); renderStep(true);
});
$('confirm-battery').addEventListener('click', () => { monitor.confirmBattery(performance.now()); renderReadings(); });
$('open-saved').addEventListener('click', () => { void listSavedRuns(); $('saved-status').scrollIntoView({ block: 'nearest' }); });
document.querySelectorAll('[data-analysis-pane]').forEach((button) => button.addEventListener('click', () => {
  document.querySelector('.analysis-grid').dataset.activePane = button.dataset.analysisPane;
  document.querySelectorAll('[data-analysis-pane]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
}));
window.addEventListener('hashchange', () => { void route(); });
document.querySelector('.skip-link').addEventListener('click', (event) => { event.preventDefault(); $('main').focus(); });
if (!transport.isSupported() || !isSecureContext) $('connection-help').textContent = '연결하려면 노트북 Chrome·Edge에서 HTTPS 또는 localhost 주소로 열어 주세요.';
renderConnection(connection);
void listSavedRuns();
void route({ focus: false });
const tick = setInterval(renderReadings, 500);
window.addEventListener('beforeunload', (event) => {
  if (['connecting', 'flashing'].includes(programState.status)) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('pagehide', () => {
  // A hidden screen doesn't end the connection; leaving the document does.
  clearInterval(tick); viewer.dispose(); chart?.dispose(); repository.close(); void transport.disconnect(); void programmer.dispose();
});
window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
