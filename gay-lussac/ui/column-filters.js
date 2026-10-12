import { DEFAULT_FILTER, columnRanges } from '../analysis/table-data.js';
import { clockTime, formatClockTime, parseClockTime } from '../analysis/clock-time.js';
import { positionPopover } from './anchored-popover.js';

// One header-anchored editor; Workspace owns all filter definitions and row projection.
export function createColumnFilters(root, { getWorkspace, act, signal }) {
  const panel = root.querySelector('#column-filter-panel');
  let anchor = null, column = null;
  const current = () => ({ ...DEFAULT_FILTER, ...getWorkspace().getState().table.filter });
  function close() { panel.hidePopover(); }
  function position() {
    positionPopover(panel, anchor);
  }
  function apply(patch, dismiss = false) {
    act(() => {
      getWorkspace().setFilter({ ...current(), ...(typeof patch === 'function' ? patch() : patch) });
      if (dismiss) close();
    });
  }
  function labelInput(parent, text, type, value = '') {
    const label = document.createElement('label'), input = document.createElement('input');
    label.textContent = text; input.type = type; input.value = value; input.dataset.workspaceAction = '';
    if (type === 'number') input.step = 'any';
    label.append(input); parent.append(label); return input;
  }
  function check(parent, text, checked, value) {
    const label = document.createElement('label'), input = document.createElement('input');
    label.className = 'filter-choice'; input.type = 'checkbox'; input.checked = checked;
    input.value = value; input.dataset.workspaceAction = ''; label.append(input, document.createTextNode(text)); parent.append(label);
    return input;
  }
  function statusChoices(form, key, value, choices) {
    const inputs = choices.map(([id, label]) => check(form, label, value === 'all' || value === id, id));
    for (const input of inputs) input.addEventListener('change', () => {
      const checked = inputs.filter(el => el.checked);
      apply({ [key]: checked.length === inputs.length ? 'all' : checked[0]?.value ?? 'none' });
    });
  }
  function open(button) {
    if (anchor === button && panel.matches(':popover-open')) { close(); return; }
    close(); anchor?.setAttribute('aria-expanded', 'false'); anchor = button; column = button.dataset.filter;
    const f = current(), form = document.createElement('form'), title = document.createElement('strong');
    title.textContent = button.dataset.filterName + ' 필터'; panel.setAttribute('aria-label', title.textContent);
    panel.replaceChildren(title, form);
    let submit = null;
    if (column === 'usage') {
      statusChoices(form, 'usage', f.usage, [['excluded', '제외'], ['included', '사용']]);
    } else if (column === 'note') {
      statusChoices(form, 'validity', f.validity, [['valid', '정상 범위'], ['invalid', '값 확인 필요']]);
      const reason = labelInput(form, '제외 사유에 포함된 글자', 'text', f.reason ?? ''); reason.maxLength = 200;
      submit = () => apply({ reason: reason.value.trim() }, true);
    } else if (column === 'receivedAt') {
      const legacy = columnRanges(f).receivedAt;
      const range = f.clockTime ?? { min: clockTime(legacy?.min), max: clockTime(legacy?.max) };
      const min = labelInput(form, '시작 시각', 'text', formatClockTime(range.min));
      const max = labelInput(form, '끝 시각', 'text', formatClockTime(range.max));
      for (const input of [min, max]) { input.placeholder = '시:분:초.밀리초'; input.maxLength = 12; }
      submit = () => apply(() => {
        const ranges = columnRanges(current()); delete ranges.receivedAt;
        return { min: null, max: null, ranges, clockTime: { min: parseClockTime(min.value), max: parseClockTime(max.value) } };
      }, true);
    } else {
      const range = columnRanges(f)[column] ?? { min: null, max: null };
      const min = labelInput(form, '최솟값', 'number', range.min ?? '');
      const max = labelInput(form, '최댓값', 'number', range.max ?? '');
      submit = () => {
        const read = el => el.value === '' ? null : Number(el.value);
        apply({ min: null, max: null, ranges: { ...columnRanges(current()), [column]: { min: read(min), max: read(max) } } }, true);
      };
    }
    const actions = document.createElement('div'); actions.className = 'filter-actions';
    if (submit) { const button = document.createElement('button'); button.type = 'submit'; button.textContent = '적용'; actions.append(button); }
    const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = '이 열 필터 해제'; actions.append(reset); form.append(actions);
    form.addEventListener('submit', event => { event.preventDefault(); submit?.(); });
    reset.addEventListener('click', () => {
      if (column === 'usage') apply({ usage: 'all' }, true);
      else if (column === 'note') apply({ validity: 'all', reason: '' }, true);
      else { const ranges = columnRanges(current()); delete ranges[column];
        apply({ min: null, max: null, ranges, ...(column === 'receivedAt' ? { clockTime: null } : {}) }, true); }
    });
    panel.showPopover(); anchor.setAttribute('aria-expanded', 'true'); position();
  }
  root.addEventListener('click', event => { const button = event.target.closest('[data-filter]'); if (button && !button.disabled) open(button); }, { signal });
  panel.addEventListener('toggle', () => { if (!panel.matches(':popover-open')) anchor?.setAttribute('aria-expanded', 'false'); }, { signal });
  window.addEventListener('resize', position, { signal });
  window.addEventListener('scroll', position, { signal, capture: true, passive: true });
  return { close };
}
