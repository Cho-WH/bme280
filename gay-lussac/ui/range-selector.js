import { timeBounds, rangeSampleIds } from '../analysis/scope.js';

// Only the draft and pointer interaction live here. Apply is a Workspace command.
export function createRangeSelector(root, { getChart, onApply, onClose, signal }) {
  const $ = id => root.querySelector('#' + id), form = $('range-form'), overlay = $('range-overlay');
  const inputs = [$('time-range-start'), $('time-range-end')], handles = [$('range-start-handle'), $('range-end-handle')];
  let samples = [], excluded = new Set(), bounds = null, draft = null, active = false, legacy = false, dragging = null;
  const display = value => String(Math.round(value * 1000) / 1000);
  function layout() {
    const g = getChart()?.timeGeometry();
    if (!g || !active || !draft || ![draft.startAt, draft.endAt].every(Number.isFinite)) return;
    Object.assign(overlay.style, { left: g.left + 'px', top: g.top + 'px', width: g.width + 'px', height: g.height + 'px' });
    const positions = [draft.startAt, draft.endAt].map(at => Math.max(0, Math.min(g.width, g.pixel(at) - g.left)));
    overlay.style.setProperty('--range-left', positions[0] + 'px'); overlay.style.setProperty('--range-right', positions[1] + 'px');
    Object.assign($('range-window').style, { left: positions[0] + 'px', width: Math.max(0, positions[1] - positions[0]) + 'px' });
    handles.forEach((handle, i) => {
      handle.style.left = positions[i] + 'px';
      handle.setAttribute('aria-valuemin', display((bounds.startAt - bounds.origin) / 1000));
      handle.setAttribute('aria-valuemax', display((bounds.endAt - bounds.origin) / 1000));
      handle.setAttribute('aria-valuenow', display(((i ? draft.endAt : draft.startAt) - bounds.origin) / 1000));
      handle.setAttribute('aria-valuetext', handle.getAttribute('aria-valuenow') + '초');
    });
  }
  function paint(syncInputs = true) {
    form.hidden = overlay.hidden = !active; $('overview-actions').hidden = active;
    if (!active || !bounds || !draft) return;
    if (syncInputs) inputs.forEach((input, i) => { input.value = display(((i ? draft.endAt : draft.startAt) - bounds.origin) / 1000); });
    inputs.forEach(input => { input.min = display((bounds.startAt - bounds.origin) / 1000); input.max = display((bounds.endAt - bounds.origin) / 1000); });
    try {
      const ids = rangeSampleIds(samples, draft), excludedCount = ids.filter(id => excluded.has(id)).length;
      if (draft.startAt < bounds.startAt || draft.endAt > bounds.endAt) throw new Error('불러온 자료 안에서 시간을 골라 주세요.');
      $('range-count').textContent = `선택한 자료 ${ids.length.toLocaleString()}개${excludedCount ? ` · 제외 ${excludedCount}개` : ''}`;
      $('apply-time-range').disabled = !ids.length;
      $('range-error').textContent = ids.length ? '' : '선택한 구간에 자료가 없어요.';
    } catch (error) { $('range-error').textContent = error.message; $('apply-time-range').disabled = true; }
    const stamp = at => new Date(at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
    $('range-hint').textContent = legacy ? '새 구간을 확정하면 이전 지정 자료를 대체합니다.' : '선택 중 · 아직 분석에 적용하지 않음';
    $('range-count').title = `${stamp(draft.startAt)} – ${stamp(draft.endAt)}`;
    layout();
  }
  function move(i, value) {
    if (!bounds) return;
    const at = Math.max(bounds.startAt, Math.min(bounds.endAt, Math.round(value)));
    if (i === 0) draft.startAt = Math.min(at, draft.endAt); else draft.endAt = Math.max(at, draft.startAt);
    paint();
  }
  handles.forEach((handle, i) => {
    handle.addEventListener('pointerdown', event => {
      if (!active) return; event.preventDefault(); handle.focus(); dragging = i;
      handle.setPointerCapture(event.pointerId); overlay.dataset.dragging = 'true';
    }, { signal });
    handle.addEventListener('pointermove', event => {
      if (dragging !== i) return;
      const g = getChart()?.timeGeometry(), rect = $('overview-chart').getBoundingClientRect();
      if (g) move(i, g.time(event.clientX - rect.left));
    }, { signal });
    const release = () => { dragging = null; delete overlay.dataset.dragging; };
    handle.addEventListener('lostpointercapture', release, { signal });
    handle.addEventListener('pointercancel', release, { signal });
    handle.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const step = Math.max(1, (bounds.endAt - bounds.startAt) / (event.shiftKey ? 100 : 1000));
      move(i, event.key === 'Home' ? bounds.startAt : event.key === 'End' ? bounds.endAt : (i ? draft.endAt : draft.startAt) + (event.key === 'ArrowLeft' ? -step : step));
    }, { signal });
  });
  inputs.forEach(input => input.addEventListener('input', () => {
    draft = { startAt: inputs[0].value === '' ? NaN : bounds.origin + inputs[0].valueAsNumber * 1000,
      endAt: inputs[1].value === '' ? NaN : bounds.origin + inputs[1].valueAsNumber * 1000 }; paint(false);
  }, { signal }));
  form.addEventListener('submit', event => { event.preventDefault(); if (!$('apply-time-range').disabled) onApply({ ...draft }); }, { signal });
  $('reset-time-range').addEventListener('click', () => { draft = { startAt: bounds.startAt, endAt: bounds.endAt }; paint(); }, { signal });
  $('cancel-time-range').addEventListener('click', () => { active = false; draft = null; paint(); onClose(); }, { signal });
  return {
    layout,
    update(nextSamples, state) { samples = nextSamples; bounds = timeBounds(samples); excluded = new Set(state.exclusions.map(e => e.sampleId)); paint(); },
    open(state) {
      if (!bounds) return;
      legacy = state.appliedScope === 'selection' && !state.analysisRange;
      if (!active || !draft) draft = state.analysisRange ? { ...state.analysisRange } : { startAt: bounds.startAt, endAt: bounds.endAt };
      active = true; paint(); inputs[0].focus({ preventScroll: true });
    },
    close() { active = false; draft = null; paint(); },
    reset() { active = false; draft = null; samples = []; bounds = null; paint(); },
    isActive: () => active,
  };
}
