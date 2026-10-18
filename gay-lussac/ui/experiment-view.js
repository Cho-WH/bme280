import { measurementGuidance } from '../measurement/guidance.js';
import { createChartView } from './chart-view.js';

// This view only paints supplied state and owns its chart resources. Session,
// progress, storage and permission changes are performed by the controllers.
export function createExperimentView(root = document) {
  const $ = id => root.querySelector('#' + id);
  let chart = null, lastChartPaint = -Infinity;
  function renderProgram(next) {
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
  }

  function renderConnection({ saved, live, connection, program, actions, supported, secure }) {
    $('connection-status').textContent = { disconnected: '연결 안 됨', connecting: '연결 중', connected: '연결됨' }[connection.status];
    $('connection-status').dataset.active = connection.status === 'connected';
    $('device-name').textContent = connection.deviceName && connection.status === 'connected' ? connection.deviceName : '마이크로비트 연결';
    $('connect').disabled = !actions.canConnect;
    if (supported && secure) $('connection-help').textContent = saved?.runStatus === 'complete'
      ? '측정을 마친 실험이에요. 위의 추가 측정으로 이어가거나 새 실험을 시작하세요.'
      : !actions.canConnectSource && saved ? '재생 또는 가져온 자료예요. 실제 장치 기록은 새 실험에서 시작하세요.'
        : live?.state === 'paused' ? '기록 일시정지 중이에요. 연결해도 기록 재개 전에는 현재 값만 표시합니다.'
          : !live ? '이어 측정을 선택한 뒤 장치를 연결해 주세요.' : '전원을 켠 뒤 사용할 장치를 선택하세요.';
    $('install-program').disabled = program.busy || connection.busy || (!program.canInstall && program.status !== 'error');
    $('connect').textContent = connection.status === 'connecting' ? '장치 연결 중…' : connection.status === 'connected' ? '연결됨' : '마이크로비트 연결';
    // A pending chooser/GATT operation must settle before another attempt uses the shared BLE module.
    $('disconnect').disabled = connection.status === 'disconnected' || connection.busy;
    $('connection-message').textContent = connection.message;
    $('connection-message').hidden = !connection.message;
    if (!supported || !secure) $('connection-help').textContent = !secure
      ? '이 주소에서는 장치를 연결할 수 없어요. https로 시작하는 실험 주소를 열어 주세요.'
      : '장치를 연결하려면 노트북의 최신 Chrome·Edge에서 열어 주세요.';
  }

  function renderReadings({ saved, snapshot, latestSample, now, connection, program, step, fresh, ready }) {
    $('reception-status').textContent = fresh ? '새 값 수신 중' : snapshot.latest ? '새 값 없음' : '값 대기';
    $('reception-status').dataset.active = fresh;
    const completed = saved?.runStatus === 'complete';
    const reading = completed ? latestSample : snapshot.latest;
    const problem = completed ? '' : snapshot.problem;
    $('live-state').textContent = completed ? '측정 완료' : fresh ? '수신 중' : reading ? '새 값 기다리는 중' : '수신 대기';
    $('measurement-reception').dataset.state = completed ? 'complete' : problem ? 'problem' : fresh ? 'receiving' : 'waiting';
    root.querySelector('.measurement-readings').setAttribute('aria-label', completed ? '마지막 측정값' : '현재 측정값');
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
      root.querySelectorAll(selector).forEach((element) => {
        element.textContent = snapshot.latest ? snapshot.latest[field].toFixed(digits) : '—';
        element.classList.toggle('stale', !fresh || snapshot.latest?.validity[field] !== 'valid');
      });
    }
    const batteryStep = step.id === 'battery';
    const check = batteryStep ? snapshot.battery : snapshot.reception;
    const confirmed = fresh && check.ready;
    $('check-title').textContent = batteryStep && !snapshot.battery.armed ? 'USB 분리 후 확인을 시작하세요'
      : confirmed ? '새 값 수신을 확인했어요' : '새 값이 이어서 들어오는지 확인 중';
    $('check-detail').textContent = snapshot.problem || (confirmed ? '새 온도·압력값이 계속 들어오고 있어요.'
      : '새 측정값이 계속 들어오는지 확인하고 있어요.');
    if (saved?.runStatus === 'complete') {
      $('check-title').textContent = '측정을 마친 실험이에요';
      $('check-detail').textContent = '위의 추가 측정에서 조건을 확인하면 수신 확인을 다시 할 수 있어요.';
    }
    if (['reception', 'battery'].includes(step.id)) {
      $('step-description').textContent = saved?.runStatus === 'complete'
        ? '측정을 마친 실험이에요. 추가 측정에서 조건을 확인하거나 새 실험을 시작한 뒤 장치를 연결해 주세요.'
        : step.description;
    }
    $('reception-check').dataset.ready = confirmed;
    $('confirm-battery').disabled = connection.status !== 'connected' || connection.busy;
    $('confirm-battery').textContent = snapshot.battery.armed ? 'USB 분리 시점부터 다시 확인' : '배터리 연결 후 USB를 분리했어요';
    $('next-step').disabled = program.busy || (step.id === 'program' ? program.status !== 'success'
      : step.id === 'reception' ? !ready : batteryStep ? !confirmed : false);
  }

  function renderStorage({ saved, live, actions }) {
    if (!saved) return;
    // Keep routine batch transitions quiet while recording; failures remain visible.
    const storageLabel = !saved.writable ? '읽기 전용'
      : saved.error || saved.status === 'error' ? '저장 문제'
        : actions.canRecord ? '자동 저장 중'
          : live?.state === 'paused' && saved.status === 'clean' ? '정지 전 기록 저장됨'
          : { clean: '이 브라우저에 저장됨', pending: '저장 대기', saving: '저장 중' }[saved.status];
    if ($('storage-status').textContent !== storageLabel) $('storage-status').textContent = storageLabel;
    $('storage-status').dataset.error = saved.status === 'error';
    $('storage-problem').hidden = saved.status !== 'error';
    $('storage-detail').textContent = `아직 저장되지 않은 측정값 ${saved.pendingSamples}개 · 조작·수신 기록 ${saved.pendingEvents}개가 있어요. 다시 저장을 눌러 주세요. 이 탭을 닫기 전에 이어하기용 파일로 자료와 메모를 보관할 수도 있어요.`;
    $('temporary-analysis').hidden = live?.state !== 'finishing';
    $('retry-save').disabled = saved.status === 'saving';
  }

  function renderRecording({ saved, live, actions, ready, screen, busy, locksSupported }) {
    $('current-run-summary').hidden = !saved;
    $('download-menu-button').closest('.help-action').hidden = !saved;
    $('new-run').disabled = !actions.canStartRun;
    if (!saved) $('additional-measurement').hidden = true;
    if (!saved) return;
    const paused = live?.state === 'paused';
    $('run-phase').textContent = saved.runStatus === 'complete' ? '측정 완료' : paused || saved.runStatus === 'paused' ? '기록 일시정지' : live ? '측정 중' : '미완료';
    $('paused-notice').hidden = !paused || screen === 'measure';
    $('additional-measurement').hidden = saved.runStatus !== 'complete';
    $('additional-measurement').disabled = !actions.canAddMeasurements;
    $('additional-measurement').title = actions.canConnectSource ? '' : '실제 장치 기록은 새 실험에서 시작하세요.';
    $('run-name').textContent = saved.name;
    const readOnlyReason = locksSupported
      ? '다른 탭에서 이 실험을 수정 중이에요. 그 탭을 닫고 다시 확인해 주세요.'
      : '이 브라우저에서는 실험을 수정할 수 없어요. 최신 Chrome·Edge에서 열어 주세요.';
    $('run-summary').textContent = `${saved.sampleCount.toLocaleString()}개 기록 · ${saved.savedSampleId.toLocaleString()}개 저장 완료${!saved.writable ? ' · ' + readOnlyReason : ''}`;
    $('download-menu-button').disabled = busy.opening;
    $('resume-panel').hidden = !!live || saved.runStatus === 'complete';
    $('resume-message').textContent = saved.writable
      ? '마지막으로 저장된 미완료 기록을 열었어요. 이어 측정하거나 여기까지 분석할 수 있어요.'
      : '현재 기록을 보거나 파일로 저장할 수 있어요. ' + readOnlyReason;
    $('resume-run').disabled = $('analyze-unfinished').disabled = !saved.writable || busy.opening;
    $('retry-lock').hidden = saved.writable;
    $('confirm-placement').hidden = !!live?.placed || !actions.canRecord;
    $('heating-start').disabled = !actions.canRecord || !ready || !live?.placed || live?.heating;
    $('heating-start').textContent = live?.heating ? '가열 시작 기록됨' : '가열 시작';
    $('water-added').disabled = $('device-change').disabled = !actions.hasLiveSession || !live?.sampleCount;
    $('pause-recording').hidden = saved.runStatus === 'complete';
    $('pause-recording').disabled = !actions.hasLiveSession || busy.opening;
    $('pause-recording').textContent = paused ? '기록 재개' : '기록 일시정지';
    $('finish-run').disabled = !live || live.state === 'ended' || busy.opening;
    $('finish-run-label').textContent = live?.state === 'finishing' ? '저장 다시 시도' : '측정 마치기';
    $('measurement-guidance').textContent = live ? measurementGuidance(live, ready)
      : saved.runStatus === 'complete' ? '측정을 마친 실험입니다. 자료를 분석하거나 위의 추가 측정으로 기록을 이어가세요.' : '이어 측정을 선택하면 마지막 자료 다음부터 기록합니다.';
    $('measurement-guidance').hidden = !$('measurement-guidance').textContent;
  }

  function resetChart() { chart?.dispose(); chart = null; lastChartPaint = -Infinity; }
  return {
    renderProgram, renderStorage,
    render(model) { renderConnection(model); renderReadings(model); renderRecording(model); renderStorage(model); },
    chartDue: now => !chart || now - lastChartPaint >= 1000,
    invalidateChart() { lastChartPaint = -Infinity; },
    resizeChart() { chart?.resize(); },
    renderChart(model, now) {
      try {
        chart ??= createChartView($('live-chart'));
        chart.render(model); lastChartPaint = now;
        $('chart-empty').hidden = model.points.length > 0;
        $('chart-error').hidden = true;
      } catch (error) { $('chart-error').hidden = false; $('chart-error').textContent = error.message; }
    },
    resetChart, dispose: resetChart,
  };
}
