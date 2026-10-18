import { measurementGuidance } from '../measurement/guidance.js';
import { createChartView } from './chart-view.js';

// This view only paints supplied state and owns its chart resources. Session,
// progress, storage and permission changes are performed by the controllers.
export function createExperimentView(root = document) {
  const $ = id => root.querySelector('#' + id);
  let chart = null, lastChartPaint = -Infinity;
  function renderConnection({ connection, program }) {
    $('connection-status').textContent = { disconnected: '연결 안 됨', connecting: '연결 중', connected: '연결됨' }[connection.status];
    $('connection-status').dataset.active = connection.status === 'connected';
    $('program-busy').hidden = !['connecting', 'flashing'].includes(program.status);
  }

  function renderReadings({ saved, snapshot, latestSample, now, fresh }) {
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
    renderStorage,
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
