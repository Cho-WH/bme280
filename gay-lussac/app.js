import { PROGRAM } from './program-config.js';
import { STEPS } from './guide/steps.js';
import { createGuideProgress } from './guide/progress.js';
import { createViewerAdapter } from './guide/viewer-adapter.js';
import { createProgrammer } from './guide/programmer-adapter.js';
import { createTransport } from './measurement/transport.js';
import { createReceptionMonitor } from './measurement/reception-monitor.js';
import { createRepository } from './data/repository.js';
import { createExperimentView } from './ui/experiment-view.js';
import { timeGraphData } from './analysis/time-series.js';
import { measurementActions, readingStatus } from './measurement/actions.js';
import { createMeasurementController } from './measurement/controller.js';
import { openRunStore } from './data/run-store.js';
import { createSession } from './measurement/session.js';
import { importRun } from './data/import-run.js';
import { createFileControls } from './ui/file-controls.js';
import { renderEvents, createEventNoteDialog } from './ui/run-view.js';
import { createAnalysisView } from './ui/analysis-view.js';
import { createAdditionalDialog } from './ui/additional-dialog.js';
import { createDeleteRunDialog } from './ui/delete-run-dialog.js';
import { createSavedRunsView } from './ui/saved-runs-view.js';
import { createGuideView } from './ui/guide-view.js';
import { createActionHelp } from './ui/action-help.js';
import { createExperimentGuide } from './ui/experiment-guide.js';
import { actionHelpMessages } from './ui/action-help-content.js';

const $ = (id) => document.getElementById(id);
const experimentView = createExperimentView();
const actionHelp = createActionHelp(document.body, { messages: actionHelpMessages });
const experimentGuide = createExperimentGuide($('experiment-guide'));
let pendingGuideRunId = null;
const transport = createTransport();
let monitor = createReceptionMonitor();
const repository = createRepository({ onUnavailable: storageUnavailable });
let screen = 'home';
let stepIndex = 0;
const guideProgress = createGuideProgress(STEPS);
let connection = transport.getState();
let routeRequest = 0;
let runStore = null, session = null, openingRun = null, importingRun = false;
let deletingRun = false;
let renamingRun = false;
let lastEventPaint = -1;
let chartRange = 'recent';
const LAST_RUN = 'bme280.gay-lussac.last-run';
const deleteRunDialog = createDeleteRunDialog($('delete-run-dialog'), deleteSavedRun);
const savedRunsView = createSavedRunsView(document.querySelector('.saved-section'), {
  onOpen(id) { void act(async () => { await openRun(id); navigate('analysis'); }); },
  onDelete: (run, anchor) => deleteRunDialog.show(run, anchor),
  onRename: renameSavedRun,
});
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
  stepIndex = STEPS.findIndex(step => step.id === 'reception');
  navigate('prepare'); renderReadings();
  connectDevice({ reuseDevice: true });
});
const eventNoteDialog = createEventNoteDialog($('event-note-dialog'), (event, note) => {
  if (event.runId !== runStore?.getState().id) throw new Error('현재 실험의 기록을 다시 선택해 주세요.');
  runStore.updateEventNote(event.eventId, note);
  renderEventLists();
});
const programmer = createProgrammer({ program: PROGRAM, onState: handleProgramState,
  beforeFlash: async () => { await transport.disconnect(); },
});
let programState = programmer.getState();

function storageUnavailable(message) {
  savedRunsView.setStatus(message);
}
const guideView = createGuideView({ root: document.querySelector('[data-screen="prepare"]'), steps: STEPS,
  onSelectStep(step) { stepIndex = STEPS.indexOf(step); renderStep(true); },
  onRestore() { viewer.restoreStep(); },
});
const viewer = createViewerAdapter($('guide-frame'), state => guideView.setViewerState(state));

const measurement = createMeasurementController({
  getSession: () => session, getMonitor: () => monitor, getConnection: () => connection,
  getActions, onConfirmed: confirmGuideStep, onRefresh: renderReadings,
});
function handleProgramState(next) {
  programState = next;
  guideView.renderProgram(next);
  if (next.status === 'success') confirmGuideStep('program');
  renderReadings();
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

function handleConnectionState(next) {
  if (next.status === 'disconnected' && connection.status !== 'disconnected') measurement.disconnected();
  connection = next;
  renderReadings();
}
function measurementContext() {
  const context = { saved: runStore?.getState(), run: runStore?.getRun(), live: session?.getState(), connection,
    program: programState, profile: PROGRAM.profile, supported: transport.isSupported(), secure: isSecureContext,
    locksSupported: Boolean(navigator.locks), screen,
    busy: { opening: Boolean(openingRun), importing: importingRun, deleting: deletingRun, renaming: renamingRun } };
  return { ...context, actions: measurementActions(context) };
}
function getActions() { return measurementContext().actions; }
function renderReadings() {
  const context = measurementContext(), now = performance.now(), snapshot = monitor.getSnapshot(now);
  const readiness = readingStatus(snapshot, connection);
  experimentGuide.setRecording(readiness.fresh && context.actions.canRecord);
  guideView.renderStatus({ ...context, ...readiness, snapshot });
  experimentView.render({ ...context, ...readiness, snapshot, now,
    latestSample: context.saved?.runStatus === 'complete' ? runStore.getLatestSample() : null });
  if (screen === 'measure' && experimentView.chartDue(now)) {
    const points = chartRange === 'all' && runStore ? runStore.getSamples() : snapshot.points;
    experimentView.renderChart(timeGraphData(points, now, { range: chartRange, events: runStore?.getEvents(100) ?? [],
      origin: runStore?.getFirstSample()?.receivedAt ?? points[0]?.receivedAt }), now);
  }
  if (lastEventPaint !== (context.saved?.eventsVersion ?? -1)) renderEventLists();
  renderAnalysisStatus();
}

async function listSavedRuns() {
  try {
    await repository.open();
    const runs = await repository.listRuns();
    savedRunsView.render(runs);
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
      transport.forgetDevice();
      analysisView.reset(); runStore = null; session = null; monitor = createReceptionMonitor();
      experimentView.resetChart(); lastEventPaint = -1;
      $('storage-status').textContent = '저장할 실험 없음';
      $('storage-problem').hidden = $('paused-notice').hidden = true;
      history.replaceState(null, '', '#/home');
    }
    try {
      if (localStorage.getItem(LAST_RUN) === run.id) localStorage.removeItem(LAST_RUN);
      sessionStorage.removeItem(`gay-lussac.guide-progress:${run.id}`);
    } catch { /* Optional UI history does not affect deletion. */ }
    experimentGuide.forget(run.id);
    await listSavedRuns();
    if (current) await route();
    showMessage('실험을 삭제했어요.'); savedRunsView.focusHeading();
  } finally {
    if (!current) target?.dispose();
    deletingRun = false;
  }
}

async function route({ focus = true } = {}) {
  experimentGuide.close();
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
    experimentView.resizeChart();
    renderReadings();
  }
  if (screen === 'home') void listSavedRuns();
  if (screen === 'analysis') renderAnalysis();
  syncRunLinks();
  renderReadings();
  if (focus) document.querySelector(`[data-screen="${screen}"] h1`).focus({ preventScroll: true });
  if (screen === 'measure' && pendingGuideRunId === runStore?.getState().id) {
    experimentGuide.show({ runId: pendingGuideRunId, automatic: true, anchor: $('show-experiment-guide') });
  }
  pendingGuideRunId = null;
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
const canAddMeasurements = () => getActions().canAddMeasurements;
const hasLiveSession = () => getActions().hasLiveSession;
function onStoreChange() { renderStorage(); }
function renderStorage() {
  experimentView.renderStorage(measurementContext());
  renderAnalysisStatus();
}
function renderAnalysisStatus() {
  if (screen !== 'analysis') return;
  analysisView.updateStatus();
  if (session?.getState().state === 'finishing') {
    $('analysis-message').textContent = '측정은 멈췄지만, 아직 저장되지 않은 자료가 있어요. 다시 저장하거나 임시 자료로 분석을 선택해 주세요.';
  }
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
    transport.forgetDevice();
    runStore = next; session = null; monitor = createReceptionMonitor(); lastEventPaint = -1; experimentView.invalidateChart();
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
  })().finally(() => { openingRun = null; renderReadings(); });
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
  else {
    measurement.markEvent('placement');
    if (session?.getState().placed) pendingGuideRunId = runStore.getState().id;
    navigate('measure');
  }
});
$('show-experiment-guide').addEventListener('click', () => {
  actionHelp.close();
  experimentGuide.show({ runId: runStore?.getState().id, anchor: $('show-experiment-guide') });
});
document.querySelectorAll('[data-guide-connection]').forEach(button => button.addEventListener('click', () => {
  stepIndex = STEPS.findIndex(step => step.id === 'reception');
  if (screen === 'prepare') renderStep(true); else navigate('prepare');
}));
function connectDevice({ reuseDevice = false } = {}) {
  if (!getActions().canConnect) return;
  void transport.connect(PROGRAM.profile, measurement.acceptInput, handleConnectionState, { reuseDevice });
}
$('connect').addEventListener('click', () => connectDevice());
$('disconnect').addEventListener('click', () => { void transport.disconnect(); });
$('pause-recording').addEventListener('click', () => { void act(async () => {
  if (!hasLiveSession()) return;
  const pending = session.getState().state === 'paused' ? session.resume() : session.pause();
  renderReadings();
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
$('confirm-battery').addEventListener('click', () => { measurement.confirmBattery(); });
$('new-run').addEventListener('click', () => { void act(async () => { await openRun(null); navigate('prepare'); }); });
$('retry-lock').addEventListener('click', () => { void act(async () => {
  const id = runStore.getState().id;
  await openRun(id, { force: true }); renderAnalysis();
}); });
$('resume-run').addEventListener('click', () => { void act(async () => {
  if (session || !runStore?.getState().writable) return;
  monitor = createReceptionMonitor(); session = createSession({ store: runStore, monitor });
  if (session.getState().state === 'paused') session.resume();
  runStore.updateRun({ status: 'open' }); session.markEvent('resumed'); navigate('measure'); renderReadings();
}); });
$('analyze-unfinished').addEventListener('click', () => { void act(async () => {
  if (!runStore?.getState().writable) return;
  session ??= createSession({ store: runStore, monitor }); await finishAndAnalyze();
}); });
$('go-to-analysis').addEventListener('click', () => navigate('analysis'));
for (const id of ['finish-run', 'finish-for-analysis']) $(id).addEventListener('click', () => { void act(finishAndAnalyze); });
$('temporary-analysis').addEventListener('click', () => { void act(async () => {
  session?.useTemporary(); await transport.disconnect(); navigate('analysis');
}); });
$('retry-save').addEventListener('click', () => { void act(async () => {
  if (session?.getState().state === 'finishing') await finishAndAnalyze();
  else { await runStore.flush(); renderReadings(); if (screen === 'analysis') renderAnalysis(); }
}); });
for (const [id, type] of [['confirm-placement', 'placement'], ['heating-start', 'heating-start'], ['water-added', 'water-added']]) {
  $(id).addEventListener('click', () => { measurement.markEvent(type); });
}
$('device-change').addEventListener('click', () => { $('device-form').hidden = false; $('device-kind').focus(); });
$('cancel-device').addEventListener('click', () => { $('device-form').hidden = true; });
$('device-form').addEventListener('submit', (event) => {
  event.preventDefault();
  measurement.markEvent('device-change', { kind: $('device-kind').value, note: $('device-note').value.trim() });
  $('device-note').value = ''; $('device-form').hidden = true; renderReadings();
});
$('chart-range').addEventListener('change', () => { chartRange = $('chart-range').value; experimentView.invalidateChart(); renderReadings(); });
window.addEventListener('hashchange', () => { actionHelp.close(); void route(); });
document.querySelector('.skip-link').addEventListener('click', (event) => { event.preventDefault(); $('main').focus(); });
renderReadings();
void listSavedRuns();
void (async () => {
  let last;
  try { last = localStorage.getItem(LAST_RUN); } catch { /* Opening by a URL still works. */ }
  if (last && !location.hash.includes('run=')) {
    try { await openRun(last); } catch (error) { showMessage(error.message); }
  }
  await route({ focus: false });
})();
measurement.start();
window.addEventListener('beforeunload', (event) => {
  if (['connecting', 'flashing'].includes(programState.status) || (hasLiveSession() && runStore.getState().sampleCount > 0) || (runStore && runStore.getState().status !== 'clean')) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('pagehide', () => {
  // A hidden screen doesn't end the connection; leaving the document does.
  measurement.dispose(); actionHelp.dispose(); experimentGuide.dispose(); fileControls.dispose(); guideView.dispose(); analysisView.dispose(); runStore?.dispose(); viewer.dispose(); experimentView.dispose(); repository.close(); void transport.disconnect(); void programmer.dispose();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) void runStore?.flush().catch(() => {}); });
window.addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
