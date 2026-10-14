import { PROGRAM } from './program-config.js';
import { STEPS } from './guide/steps.js';
import { createGuideProgress } from './guide/progress.js';
import { createViewerAdapter } from './guide/viewer-adapter.js';
import { createProgrammer } from './guide/programmer-adapter.js';
import { createTransport } from './measurement/transport.js';
import { createReceptionMonitor } from './measurement/reception-monitor.js';
import { createRepository } from './data/repository.js';
import { createChartView } from './ui/chart-view.js';
import { openRunStore } from './data/run-store.js';
import { createSession } from './measurement/session.js';
import { measurementGuidance } from './measurement/guidance.js';
import { importRun } from './data/import-run.js';
import { createFileControls } from './ui/file-controls.js';
import { renderEvents, createEventNoteDialog } from './ui/run-view.js';
import { createAnalysisView } from './ui/analysis-view.js';
import { createAdditionalDialog } from './ui/additional-dialog.js';
import { createDeleteRunDialog } from './ui/delete-run-dialog.js';
import { createRunNameEditor } from './ui/run-name-editor.js';
import { createGuideView } from './ui/guide-view.js';
import { createActionHelp } from './ui/action-help.js';
import { actionHelpMessages } from './ui/action-help-content.js';

const $ = (id) => document.getElementById(id);
const actionHelp = createActionHelp(document.body, { messages: actionHelpMessages });
const transport = createTransport();
let monitor = createReceptionMonitor();
const repository = createRepository({ onUnavailable: storageUnavailable });
let screen = 'home';
let stepIndex = 0;
const guideProgress = createGuideProgress(STEPS);
let connection = transport.getState();
let chart;
let lastChartPaint = 0;
let routeRequest = 0;
let runStore = null, session = null, openingRun = null, importingRun = false;
let deletingRun = false;
let renamingRun = false;
let lastEventPaint = -1;
let chartRange = 'recent';
const LAST_RUN = 'bme280.gay-lussac.last-run';
const deleteRunDialog = createDeleteRunDialog($('delete-run-dialog'), deleteSavedRun);
const analysisView = createAnalysisView(document.querySelector('[data-screen="analysis"]'), { onError: showMessage,
  onExport: (kind, anchor) => fileControls.export(kind, anchor) });
const fileControls = createFileControls({ getSnapshot: () => runStore?.getSnapshot() ?? null,
  canExportGraph: () => screen === 'analysis' && analysisView.hasGraph(),
  exportPng: name => analysisView.exportPng(name), onMessage: showMessage, onError: showMessage,
  async importSnapshot(snapshot) {
    assertCanSwitchRun();
    importingRun = true;
    try {
      const id = await importRun({ repository, snapshot });
      await openRun(id, { fromImport: true }); navigate('analysis');
    } finally { importingRun = false; renderReadings(); }
  },
});
const additionalDialog = createAdditionalDialog($('additional-dialog'), confirmation => {
  if (!canAddMeasurements()) throw new Error('자료가 모두 저장되었는지 확인해 주세요. 다른 탭에서 같은 실험을 열었다면 닫고 다시 시도하세요.');
  session ??= createSession({ store: runStore, monitor });
  session.startAdditional(confirmation);
  guideProgress.clear(['reception', 'battery', 'placement']);
  guideView.setCompleted(guideProgress.getCompleted());
  stepIndex = STEPS.findIndex(step => step.id === 'placement');
  navigate('measure'); renderConnection(connection);
});
const eventNoteDialog = createEventNoteDialog($('event-note-dialog'), (event, note) => {
  if (event.runId !== runStore?.getState().id) throw new Error('현재 실험의 기록을 다시 선택해 주세요.');
  runStore.updateEventNote(event.eventId, note);
  renderEventLists();
});
const programmer = createProgrammer({ program: PROGRAM, onState: renderProgram,
  beforeFlash: async () => { await transport.disconnect(); },
});
let programState = programmer.getState();

function storageUnavailable(message) {
  $('saved-status').textContent = message;
}
const guideView = createGuideView({ root: document.querySelector('[data-screen="prepare"]'), steps: STEPS,
  onSelectStep(step) { stepIndex = STEPS.indexOf(step); renderStep(true); },
  onRestore() { viewer.restoreStep(); },
});
const viewer = createViewerAdapter($('guide-frame'), state => guideView.setViewerState(state));

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
  guideView.setBusy(next.busy);
  if (next.status === 'success') confirmGuideStep('program');
  renderConnection(connection);
}

function confirmGuideStep(id) {
  if (guideProgress.confirm(id)) guideView.setCompleted(guideProgress.getCompleted());
}

function renderStep(focus = false) {
  const step = STEPS[stepIndex];
  guideView.render(step, { focus });
  if (screen === 'prepare' && step.id !== 'placement') viewer.applyStep(step);
  renderReadings();
  if (step.id === 'program' && programState.status === 'idle') void programmer.prepare();
}

function renderConnection(next) {
  if (next.status === 'disconnected' && connection.status !== 'disconnected') {
    if (session) session.disconnected(); else monitor.disconnected();
  }
  connection = next;
  $('connection-status').textContent = { disconnected: '연결 안 됨', connecting: '연결 중', connected: '연결됨' }[next.status];
  $('connection-status').dataset.active = next.status === 'connected';
  $('device-name').textContent = next.deviceName && next.status === 'connected' ? next.deviceName : '마이크로비트 연결';
  $('connect').disabled = !hasLiveSession() || !canConnectSource() || !!openingRun || programState.busy || next.busy || next.status !== 'disconnected' || !transport.isSupported() || !isSecureContext;
  if (transport.isSupported() && isSecureContext) $('connection-help').textContent = runStore?.getState().runStatus === 'complete'
    ? '측정을 마친 실험이에요. 위의 추가 측정으로 이어가거나 새 실험을 시작하세요.'
    : !canConnectSource() && runStore ? '재생 또는 가져온 자료예요. 실제 장치 기록은 새 실험에서 시작하세요.'
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
  if (hasLiveSession()) {
    if (ready) confirmGuideStep('reception');
    if (fresh && snapshot.battery.armed && snapshot.battery.ready) confirmGuideStep('battery');
    if (session.getState().placed) confirmGuideStep('placement');
  }
  $('reception-status').textContent = fresh ? '새 값 수신 중' : snapshot.latest ? '새 값 없음' : '값 대기';
  $('reception-status').dataset.active = fresh;
  const completed = runStore?.getState().runStatus === 'complete';
  const reading = completed ? runStore.getLatestSample() : snapshot.latest;
  const problem = completed ? '' : snapshot.problem;
  $('live-state').textContent = completed ? '측정 완료' : fresh ? '수신 중' : reading ? '새 값 기다리는 중' : '수신 대기';
  $('measurement-reception').dataset.state = completed ? 'complete' : problem ? 'problem' : fresh ? 'receiving' : 'waiting';
  document.querySelector('.measurement-readings').setAttribute('aria-label', completed ? '마지막 측정값' : '현재 측정값');
  $('last-received').textContent = completed
    ? reading ? `마지막 측정값 · ${new Date(reading.receivedAt).toLocaleTimeString('ko-KR')}` : '기록된 측정값이 없어요'
    : reading ? `마지막 수신 ${Math.max(0, Math.floor((now - reading.monotonicAt) / 1000))}초 전` : '아직 받은 값이 없어요';
  $('last-received').hidden = !!problem;
  $('reading-problem').textContent = problem;
  $('reading-problem').hidden = !problem;
  for (const [id, field] of [['measure-temperature', 'temperatureC'], ['measure-pressure', 'pressureHpa']]) {
    const value = reading?.[field];
    $(id).textContent = Number.isFinite(value) ? value.toFixed(2) : '—';
    $(id).classList.toggle('stale', !!reading && ((!completed && !fresh) || reading.validity?.[field] !== 'valid'));
  }
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
  $('check-detail').textContent = snapshot.problem || (confirmed ? '새 온도·압력값이 계속 들어오고 있어요.'
    : '새 측정값이 계속 들어오는지 확인하고 있어요.');
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
    const runs = await repository.listRuns();
    $('saved-runs').replaceChildren();
    $('saved-status').textContent = runs.length ? `${runs.length}개의 실험이 이 브라우저에 저장되어 있어요.`
      : '저장된 실험이 없습니다. 새 실험을 시작하면 여기에 기록이 남아요.';
    for (const run of runs) {
      const li = document.createElement('li');
      const label = document.createElement('div'); label.className = 'saved-run-detail';
      const meta = document.createElement('span'); meta.className = 'saved-run-meta';
      meta.textContent = `${run.status === 'complete' ? '측정 완료' : run.status === 'paused' ? '기록 일시정지' : '미완료'} · ${run.lastSavedSampleId.toLocaleString()}개`;
      const button = document.createElement('button'); button.textContent = '열기';
      button.addEventListener('click', () => { void act(async () => { await openRun(run.id); navigate('analysis'); }); });
      const actions = document.createElement('div'); actions.className = 'saved-run-actions';
      const remove = document.createElement('button'); remove.textContent = '삭제'; remove.className = 'delete-run';
      remove.setAttribute('aria-label', `${run.name} 삭제`);
      remove.addEventListener('click', () => deleteRunDialog.show(run, remove));
      label.append(createRunNameEditor(run, async name => {
        await renameSavedRun(run.id, name);
        remove.setAttribute('aria-label', `${name} 삭제`);
      }), meta);
      actions.append(button, remove); li.append(label, actions);
      $('saved-runs').append(li);
    }
  } catch { storageUnavailable('브라우저 저장소를 열지 못했어요. 저장 허용 설정을 확인한 뒤 다시 시도해 주세요.'); }
}

async function renameSavedRun(id, name) {
  if (openingRun || importingRun || deletingRun || renamingRun) throw new Error('진행 중인 작업을 마친 뒤 다시 시도해 주세요.');
  renamingRun = true;
  const current = id === runStore?.getState().id;
  let target;
  try {
    target = current ? runStore : await openRunStore({ repository, id });
    target.updateRun({ name });
    if (current) renderReadings();
    await target.flush();
  } finally {
    if (!current) target?.dispose();
    renamingRun = false;
  }
}

async function deleteSavedRun(run) {
  if (openingRun || importingRun || deletingRun || renamingRun || programState.busy) throw new Error('진행 중인 작업을 마친 뒤 삭제해 주세요.');
  const current = run.id === runStore?.getState().id;
  if (current) assertCanSwitchRun();
  deletingRun = true;
  let target;
  try {
    target = current ? runStore : await openRunStore({ repository, id: run.id });
    if (!target.getState().writable) throw new Error('다른 탭에서 이 실험을 사용 중이에요. 그 탭을 닫고 다시 삭제해 주세요.');
    if (current) await transport.disconnect();
    await target.remove();
    if (current) {
      analysisView.reset(); runStore = null; session = null; monitor = createReceptionMonitor();
      chart?.dispose(); chart = null; lastEventPaint = -1; lastChartPaint = 0;
      $('storage-status').textContent = '저장할 실험 없음';
      $('storage-problem').hidden = $('paused-notice').hidden = true;
      history.replaceState(null, '', '#/home');
    }
    try {
      if (localStorage.getItem(LAST_RUN) === run.id) localStorage.removeItem(LAST_RUN);
      sessionStorage.removeItem(`gay-lussac.guide-progress:${run.id}`);
    } catch { /* Optional UI history does not affect deletion. */ }
    await listSavedRuns();
    if (current) await route();
    showMessage('실험을 삭제했어요.'); $('saved-heading').focus({ preventScroll: true });
  } finally {
    if (!current) target?.dispose();
    deletingRun = false;
  }
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
function canConnectSource() {
  const run = runStore?.getRun();
  return run?.source === 'device' || (run?.source === 'import' && run.importedFrom?.source === 'device'
    && JSON.stringify(run.profile) === JSON.stringify(PROGRAM.profile));
}
function hasLiveSession() { return canRecord() || (!!runStore?.getState().writable && session?.getState().state === 'paused'); }
function canAddMeasurements() {
  const saved = runStore?.getState();
  return canConnectSource() && !!saved?.writable && saved.runStatus === 'complete' && saved.status === 'clean'
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
  $('storage-detail').textContent = `아직 저장되지 않은 측정값 ${saved.pendingSamples}개 · 조작·수신 기록 ${saved.pendingEvents}개가 있어요. 다시 저장을 눌러 주세요. 이 탭을 닫기 전에 이어하기용 파일로 자료와 메모를 보관할 수도 있어요.`;
  $('temporary-analysis').hidden = session?.getState().state !== 'finishing';
  $('retry-save').disabled = saved.status === 'saving';
  if (screen === 'analysis') analysisView.updateStatus();
  if (screen === 'analysis' && session?.getState().state === 'finishing') {
    $('analysis-message').textContent = '측정은 멈췄지만, 아직 저장되지 않은 자료가 있어요. 다시 저장하거나 임시 자료로 분석을 선택해 주세요.';
  }
}
function renderRecording(ready) {
  $('current-run-summary').hidden = !runStore;
  $('download-menu-button').closest('.help-action').hidden = !runStore;
  $('new-run').disabled = !!openingRun || importingRun || deletingRun;
  if (!runStore) $('additional-measurement').hidden = true;
  if (!runStore) return;
  const saved = runStore.getState();
  const live = session?.getState();
  const paused = live?.state === 'paused';
  $('run-phase').textContent = saved.runStatus === 'complete' ? '측정 완료' : paused || saved.runStatus === 'paused' ? '기록 일시정지' : session ? '측정 중' : '미완료';
  $('paused-notice').hidden = !paused || screen === 'measure';
  $('additional-measurement').hidden = saved.runStatus !== 'complete';
  $('additional-measurement').disabled = !canAddMeasurements();
  $('additional-measurement').title = canConnectSource() ? '' : '실제 장치 기록은 새 실험에서 시작하세요.';
  $('run-name').textContent = saved.name;
  const readOnlyReason = navigator.locks
    ? '다른 탭에서 이 실험을 수정 중이에요. 그 탭을 닫고 다시 확인해 주세요.'
    : '이 브라우저에서는 실험을 수정할 수 없어요. 최신 Chrome·Edge에서 열어 주세요.';
  $('run-summary').textContent = `${saved.sampleCount.toLocaleString()}개 기록 · ${saved.savedSampleId.toLocaleString()}개 저장 완료${!saved.writable ? ' · ' + readOnlyReason : ''}`;
  $('download-menu-button').disabled = !!openingRun;
  $('new-run').disabled = !!openingRun || importingRun;
  $('resume-panel').hidden = !!session || saved.runStatus === 'complete';
  $('resume-message').textContent = saved.writable
    ? '마지막으로 저장된 미완료 기록을 열었어요. 이어 측정하거나 여기까지 분석할 수 있어요.'
    : '현재 기록을 보거나 파일로 저장할 수 있어요. ' + readOnlyReason;
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
    : saved.runStatus === 'complete' ? '측정을 마친 실험입니다. 자료를 분석하거나 위의 추가 측정으로 기록을 이어가세요.' : '이어 측정을 선택하면 마지막 자료 다음부터 기록합니다.';
  if (lastEventPaint !== saved.eventsVersion) renderEventLists();
  renderStorage();
}
function renderAnalysis() {
  const active = session && session.getState().state !== 'ended';
  $('finish-for-analysis').hidden = !active;
  analysisView.open(runStore);
  renderEventLists();
}
function renderEventLists() {
  const state = runStore?.getState();
  const edit = state?.writable ? (event, button) => eventNoteDialog.show(event, button) : null;
  renderEvents($('measure-events'), runStore?.getEvents() ?? [], 15, edit);
  renderEvents($('analysis-events'), runStore?.getEvents(100) ?? [], 100, edit);
  lastEventPaint = state?.eventsVersion ?? -1;
}
async function openRun(id, { force = false, fromImport = false } = {}) {
  if (importingRun && !fromImport) throw new Error('실험 파일을 여는 중입니다. 잠시 뒤 다시 시도하세요.');
  if (openingRun) return openingRun;
  if (id && id === runStore?.getState().id && !force) return;
  assertCanSwitchRun(fromImport);
  showMessage();
  openingRun = (async () => {
    const next = await openRunStore({ repository, ...(id ? { id } : {}), create: !id, program: PROGRAM, onChange: onStoreChange });
    try { await transport.disconnect(); analysisView.reset(); await runStore?.close(); }
    catch (error) { next.dispose(); if (screen === 'analysis') analysisView.open(runStore); throw error; }
    runStore = next; session = null; monitor = createReceptionMonitor(); lastEventPaint = -1; lastChartPaint = 0;
    chartRange = id ? 'all' : 'recent'; $('chart-range').value = chartRange;
    const run = next.getRun();
    guideView.setCompleted(guideProgress.open(run.id));
    if (!id || (next.getState().writable && run.status === 'paused' && run.source !== 'import')) session = createSession({ store: next, monitor });
    else if (next.getState().writable && run.status !== 'complete' && run.source !== 'import') {
      const resumedAt = Date.now();
      next.updateRun({ status: 'interrupted' });
      next.appendEvent({ type: 'interrupted', receivedAt: resumedAt, payload: {}, source: 'system' });
    }
    try { localStorage.setItem(LAST_RUN, run.id); } catch { /* DB remains the record store. */ }
    syncRunLinks(); renderReadings();
  })().finally(() => { openingRun = null; renderConnection(connection); });
  return openingRun;
}
function assertCanSwitchRun(fromImport = false) {
  if (renamingRun) throw new Error('실험 이름을 저장 중입니다. 잠시 뒤 다시 시도하세요.');
  if (deletingRun) throw new Error('실험을 삭제 중입니다. 잠시 뒤 다시 시도하세요.');
  if (openingRun || (importingRun && !fromImport)) throw new Error('실험을 여는 중입니다. 잠시 뒤 다시 시도하세요.');
  if (session && session.getState().state !== 'ended') throw new Error('현재 측정을 먼저 마쳐 주세요. 장치 준비와 측정하기는 계속 오갈 수 있어요.');
  if (runStore && runStore.getState().status !== 'clean') throw new Error('미저장 자료가 있어요. 다시 저장한 뒤 실험을 바꿔 주세요.');
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
  if ($('next-step').disabled) return;
  if (!['program', 'reception', 'battery', 'placement'].includes(STEPS[stepIndex].id)) confirmGuideStep(STEPS[stepIndex].id);
  if (stepIndex < STEPS.length - 1) { stepIndex++; renderStep(true); }
  else { if (session?.markEvent('placement')) confirmGuideStep('placement'); navigate('measure'); }
});
document.querySelectorAll('[data-guide-connection]').forEach(button => button.addEventListener('click', () => {
  stepIndex = STEPS.findIndex(step => step.id === 'reception');
  if (screen === 'prepare') renderStep(true); else navigate('prepare');
}));
$('connect').addEventListener('click', () => {
  if (!hasLiveSession() || !canConnectSource()) return;
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
$('install-program').addEventListener('click', () => {
  if (programState.canInstall) void programmer.install();
  else void programmer.prepare();
});
$('skip-program').addEventListener('click', () => {
  stepIndex = STEPS.findIndex(step => step.id === 'reception'); renderStep(true);
});
$('confirm-battery').addEventListener('click', () => { monitor.confirmBattery(performance.now()); renderReadings(); });
$('new-run').addEventListener('click', () => { void act(async () => { await openRun(null); navigate('prepare'); }); });
$('retry-lock').addEventListener('click', () => { void act(async () => {
  const id = runStore.getState().id;
  await openRun(id, { force: true }); renderAnalysis();
}); });
$('resume-run').addEventListener('click', () => { void act(async () => {
  if (session || !runStore?.getState().writable) return;
  monitor = createReceptionMonitor(); session = createSession({ store: runStore, monitor });
  if (session.getState().state === 'paused') session.resume();
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
window.addEventListener('hashchange', () => { actionHelp.close(); void route(); });
document.querySelector('.skip-link').addEventListener('click', (event) => { event.preventDefault(); $('main').focus(); });
if (!transport.isSupported() || !isSecureContext) $('connection-help').textContent = !isSecureContext
  ? '이 주소에서는 장치를 연결할 수 없어요. https로 시작하는 실험 주소를 열어 주세요.'
  : '장치를 연결하려면 노트북의 최신 Chrome·Edge에서 열어 주세요.';
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
  clearInterval(tick); actionHelp.dispose(); fileControls.dispose(); guideView.dispose(); analysisView.dispose(); runStore?.dispose(); viewer.dispose(); chart?.dispose(); repository.close(); void transport.disconnect(); void programmer.dispose();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) void runStore?.flush().catch(() => {}); });
window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
