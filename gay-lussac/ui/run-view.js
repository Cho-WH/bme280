import { ADDITIONAL_CONDITIONS } from '../measurement/conditions.js';

const EVENT_LABELS = { 'heating-start': '가열 시작', 'water-added': '물 추가', placement: '용기 배치 확인',
  'device-change': '장치 변화', 'measurement-end': '측정 종료',
  'reception-change': '수신 상태 변화', 'parse-error': '형식 오류',
  discontinuity: '시간·연결 불연속', interrupted: '저장된 미완료 기록 열기', resumed: '이어 측정',
  'recording-paused': '기록 일시정지', 'recording-resumed': '기록 재개', 'additional-measurement': '추가 측정 시작' };
const DEVICE_LABELS = { moved: '장치 이동', opened: '뚜껑 열림', sealed: '다시 밀폐' };
const eventTitle = event => `${new Date(event.receivedAt).toLocaleTimeString('ko-KR')} · ${EVENT_LABELS[event.type] ?? event.type}`;

export function renderEvents(element, events, limit = 15, onEdit = null) {
  events = events.filter(e => e.type !== 'segment-start' && e.type !== 'segment-end');
  element.replaceChildren();
  for (const e of events.slice(-limit).reverse()) {
    const li = document.createElement('li');
    const detail = e.type === 'additional-measurement'
      ? ADDITIONAL_CONDITIONS.map(({ id, label }) => `${label}: ${{ same: '변경 없음', changed: '변경됨', unsure: '확실하지 않음' }[e.payload.conditions?.[id]] ?? '미확인'}`).join(' · ')
      : e.type === 'device-change' ? DEVICE_LABELS[e.payload.kind]
      : e.type === 'reception-change' ? (e.payload.state === 'receiving' ? '수신 확인' : '수신 중단')
        : e.type === 'discontinuity' && e.payload.reason === 'clock-change' ? '시각 변경 감지' : '';
    const text = document.createElement('span');
    text.textContent = [eventTitle(e), detail, e.payload.note].filter(Boolean).join(' · ');
    li.append(text);
    if (onEdit && e.source === 'user') {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'event-note-edit'; button.dataset.eventId = e.eventId;
      button.textContent = e.payload.note ? '메모 수정' : '메모 추가';
      button.setAttribute('aria-label', `${eventTitle(e)} ${button.textContent}`);
      button.addEventListener('click', () => onEdit(e, button));
      li.append(button);
    }
    element.append(li);
  }
  if (!events.length) { const li = document.createElement('li'); li.textContent = '아직 조작 기록이 없습니다.'; element.append(li); }
}

export function createEventNoteDialog(dialog, onSave) {
  const form = dialog.querySelector('form'), note = form.elements.note;
  const error = dialog.querySelector('[data-error]');
  let target, list;
  form.addEventListener('submit', event => {
    event.preventDefault();
    try { onSave(target, note.value); dialog.close(); }
    catch (failure) { error.textContent = failure.message; }
  });
  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    const button = [...(list?.querySelectorAll('[data-event-id]') ?? [])].find(button => Number(button.dataset.eventId) === target?.eventId);
    (button ?? list?.closest('details').querySelector('summary'))?.focus();
    target = list = null;
  });
  return { show(event, button) {
    target = event; list = button.closest('ol');
    dialog.querySelector('[data-event-title]').textContent = eventTitle(event);
    note.value = event.payload.note ?? ''; error.textContent = '';
    dialog.showModal(); note.focus();
  } };
}
