import { ADDITIONAL_CONDITIONS } from '../measurement/conditions.js';

const EVENT_LABELS = { 'heating-start': '가열 시작', 'water-added': '물 추가', placement: '용기 배치 확인',
  'device-change': '장치 변화', 'measurement-end': '측정 종료', 'segment-start': '수신 구간 시작',
  'segment-end': '수신 구간 종료', 'reception-change': '수신 상태 변화', 'parse-error': '형식 오류',
  discontinuity: '시간·연결 불연속', interrupted: '저장된 미완료 기록 열기', resumed: '이어 측정',
  'recording-paused': '기록 일시정지', 'recording-resumed': '기록 재개', 'additional-measurement': '추가 측정 시작' };
const DEVICE_LABELS = { moved: '장치 이동', opened: '뚜껑 열림', sealed: '다시 밀폐' };
export function renderEvents(element, events, limit = 15) {
  element.replaceChildren();
  for (const e of events.slice(-limit).reverse()) {
    const li = document.createElement('li');
    const detail = e.type === 'additional-measurement'
      ? [...ADDITIONAL_CONDITIONS.map(({ id, label }) => `${label}: ${{ same: '변경 없음', changed: '변경됨', unsure: '확실하지 않음' }[e.payload.conditions?.[id]] ?? '미확인'}`), e.payload.note].filter(Boolean).join(' · ')
      : e.type === 'device-change' ? [DEVICE_LABELS[e.payload.kind], e.payload.note].filter(Boolean).join(' · ')
      : e.type === 'reception-change' ? (e.payload.state === 'receiving' ? '수신 확인' : '수신 중단')
        : e.type === 'discontinuity' && e.payload.reason === 'clock-change' ? '시각 변경 감지' : '';
    li.textContent = `${new Date(e.receivedAt).toLocaleTimeString('ko-KR')} · ${EVENT_LABELS[e.type] ?? e.type}${detail ? ` · ${detail}` : ''}`;
    element.append(li);
  }
  if (!events.length) { const li = document.createElement('li'); li.textContent = '아직 조작 기록이 없습니다.'; element.append(li); }
}

export function createRawTable({ body, scroller, status }) {
  // Match the fixed CSS row height; spacer rows preserve the full scroll range.
  const rowHeight = 48, overscan = 8;
  const table = body.closest('table');
  let samples = [], frame = null, renderedStart = -1, renderedEnd = -1;
  function spacer(fragment, count) {
    if (!count) return;
    const row = document.createElement('tr');
    row.className = 'table-spacer'; row.setAttribute('aria-hidden', 'true');
    const cell = row.insertCell(); cell.colSpan = 6; cell.style.height = `${count * rowHeight}px`;
    fragment.append(row);
  }
  function paint() {
    frame = null;
    const first = Math.min(Math.floor(scroller.scrollTop / rowHeight), Math.max(0, samples.length - 1));
    const visibleCount = Math.max(1, Math.ceil(((scroller.clientHeight || 520) - rowHeight) / rowHeight));
    const start = Math.max(0, first - overscan);
    const end = Math.min(samples.length, first + visibleCount + overscan + 1);
    status.textContent = samples.length ? `전체 ${samples.length.toLocaleString()}개 · ${first + 1}–${Math.min(samples.length, first + visibleCount)}번째 행`
      : '측정 자료 없음';
    if (start === renderedStart && end === renderedEnd) return;
    renderedStart = start; renderedEnd = end;
    const fragment = document.createDocumentFragment();
    spacer(fragment, start);
    for (let index = start; index < end; index++) {
      const s = samples[index];
      const row = document.createElement('tr');
      row.className = 'sample-row'; row.dataset.sampleId = s.sampleId;
      row.setAttribute('aria-rowindex', String(index + 2));
      [s.sampleId, s.segmentId ?? '—', new Date(s.receivedAt).toLocaleTimeString('ko-KR', { hour12: false, fractionalSecondDigits: 3, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        s.temperatureC.toFixed(2), s.pressureHpa.toFixed(2),
        s.validity.temperatureC === 'valid' && s.validity.pressureHpa === 'valid' ? '정상 범위' : '범위 밖 값 포함']
        .forEach((value) => { row.insertCell().textContent = String(value); });
      fragment.append(row);
    }
    spacer(fragment, samples.length - end);
    if (!samples.length) {
      const row = document.createElement('tr'), cell = row.insertCell();
      cell.colSpan = 6; cell.className = 'empty-cell'; cell.textContent = '아직 측정 자료가 없습니다.'; fragment.append(row);
    }
    body.replaceChildren(fragment);
  }
  function schedule() { frame ??= requestAnimationFrame(paint); }
  scroller.addEventListener('scroll', schedule, { passive: true });
  const observer = new ResizeObserver(schedule); observer.observe(scroller);
  return {
    render(nextSamples) {
      samples = nextSamples; renderedStart = renderedEnd = -1;
      cancelAnimationFrame(frame);
      scroller.scrollTop = 0; table.setAttribute('aria-rowcount', String(samples.length + 1)); paint();
    },
    dispose() { observer.disconnect(); scroller.removeEventListener('scroll', schedule); cancelAnimationFrame(frame); },
  };
}
