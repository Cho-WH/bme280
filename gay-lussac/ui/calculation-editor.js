import { calculationInputs, columnLabel, formatCalculated } from '../analysis/calculations.js';
import { positionPopover } from './anchored-popover.js';

// Drafts and popover state live here. Workspace alone validates and commits definitions.
export function createCalculationEditor(root, { getWorkspace, render, signal }) {
  const menu = root.querySelector('#calculation-menu'), dialog = root.querySelector('#calculation-dialog');
  const form = dialog.querySelector('form'), error = form.querySelector('[data-error]'), submit = form.querySelector('[type=submit]');
  const name = form.elements.columnName, unit = form.elements.unit, op = form.elements.op;
  let anchor = null, returnFocus = null, editingId = null, draftId = null, nameEdited = false;
  let prerequisites = [], templateName = false;
  const fields = ['lhs', 'rhs'].map(side => {
    const group = form.querySelector(`[data-operand="${side}"]`);
    return { side, kind: group.querySelector('[data-kind]'), column: group.querySelector('[data-column]'), value: group.querySelector('[data-value]') };
  });
  function closeMenu() { menu.hidePopover(); }
  function position() { positionPopover(menu, anchor); }
  function openMenu(button, label) {
    closeMenu(); anchor?.setAttribute('aria-expanded', 'false'); anchor = button;
    menu.replaceChildren(); menu.setAttribute('aria-label', label);
  }
  function showMenu() { menu.showPopover(); anchor.setAttribute('aria-expanded', 'true'); position(); }
  function menuButton(text, action) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
    button.addEventListener('click', action); menu.append(button);
  }
  function perform(action) {
    try { action(); closeMenu(); render(); return true; }
    catch (failure) {
      let message = menu.querySelector('[role=alert]');
      if (!message) { message = document.createElement('p'); message.setAttribute('role', 'alert'); menu.append(message); }
      message.textContent = failure.message; position(); return false;
    }
  }
  function definition() {
    const operands = Object.fromEntries(fields.map(f => {
      if (f.kind.value === 'column') return [f.side, { kind: 'column', columnId: f.column.value }];
      if (f.value.value.trim() === '' || !Number.isFinite(f.value.valueAsNumber)) throw new Error((f.side === 'lhs' ? 'A' : 'B') + '에 숫자를 입력하세요.');
      return [f.side, { kind: 'constant', value: f.value.valueAsNumber }];
    }));
    return { id: draftId, name: name.value, unit: unit.value, op: op.value, ...operands };
  }
  function expression() {
    const operands = fields.map(f => f.kind.value === 'column' ? f.column.selectedOptions[0]?.textContent ?? '자료 열' : f.value.value || '숫자');
    const symbol = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^' }[op.value];
    return `${operands[0]} ${symbol} ${operands[1]}`;
  }
  function preview() {
    for (const f of fields) { f.column.hidden = f.kind.value !== 'column'; f.value.hidden = f.kind.value !== 'constant'; }
    const text = expression(); form.querySelector('[data-expression]').textContent = text;
    if (!nameEdited) name.value = text.slice(0, 60);
    const body = form.querySelector('[data-preview]'); body.replaceChildren();
    form.querySelector('[data-empty]').hidden = true; submit.disabled = true;
    try {
      const rows = getWorkspace().previewColumn(definition(), prerequisites);
      for (const row of rows) {
        const tr = document.createElement('tr'); tr.insertCell().textContent = row.sampleId;
        for (const input of row.inputs) tr.insertCell().textContent = input.reason || formatCalculated(input.value);
        tr.insertCell().textContent = row.reason || formatCalculated(row.value); body.append(tr);
      }
      form.querySelector('[data-empty]').hidden = rows.length > 0;
      error.textContent = ''; submit.disabled = false;
    } catch (failure) { error.textContent = failure.message; }
  }
  function openEditor(id = null, preset = null) {
    returnFocus = anchor; closeMenu();
    const state = getWorkspace().getState(), existing = state.calculatedColumns.find(c => c.id === id);
    const prepared = preset ? getWorkspace().preparePreset(preset) : [];
    const initial = existing ?? prepared.at(-1);
    prerequisites = prepared.slice(0, -1); templateName = !!preset;
    editingId = id; draftId = initial?.id ?? 'calc-' + crypto.randomUUID(); nameEdited = !!initial;
    const inputs = calculationInputs([...state.calculatedColumns, ...prerequisites], getWorkspace().getImportedColumns()).filter(c => c.id !== id);
    name.value = initial?.name ?? ''; unit.value = initial?.unit ?? ''; op.value = initial?.op ?? '+';
    for (const f of fields) {
      f.column.replaceChildren(...inputs.map(c => { const option = document.createElement('option'); option.value = c.id; option.textContent = columnLabel(c); return option; }));
      const operand = initial?.[f.side] ?? (f.side === 'lhs' ? { kind: 'column', columnId: 'temperatureC' } : { kind: 'constant', value: null });
      f.kind.value = operand.kind; f.column.value = operand.columnId ?? inputs[0].id; f.value.value = operand.value ?? '';
    }
    root.querySelector('#calculation-title').textContent = existing ? '계산 열 편집' : '계산 열 추가';
    submit.textContent = existing ? '변경 적용' : '열 만들기'; preview(); dialog.showModal();
    (existing ? name : fields[0].column).focus();
  }
  root.addEventListener('click', event => {
    const add = event.target.closest('#add-calculation, [data-add-calculation]'), edit = event.target.closest('[data-calculation-menu]'), reason = event.target.closest('[data-reason]');
    const button = add || edit || reason;
    if (!button || button.disabled) return;
    if (anchor === button && menu.matches(':popover-open')) { closeMenu(); return; }
    if (add) {
      openMenu(add, '계산 열 추가');
      menuButton('절대온도', () => openEditor(null, 'kelvin'));
      menuButton('압력/절대온도', () => openEditor(null, 'ratio'));
      menuButton('직접 만들기', () => openEditor());
    } else if (edit) {
      const id = edit.dataset.calculationMenu; openMenu(edit, edit.getAttribute('aria-label'));
      menuButton('계산식 편집', () => openEditor(id));
      menuButton('열 삭제', () => {
        if (perform(() => getWorkspace().deleteColumn(id))) root.querySelector('#add-calculation').focus();
      });
    } else {
      openMenu(reason, '계산 불가 이유'); const p = document.createElement('p'); p.textContent = reason.dataset.reason; menu.append(p);
    }
    showMenu();
  }, { signal });
  function changed(event) {
    if (event.target === name) { nameEdited = true; templateName = false; }
    else if (templateName) { nameEdited = false; templateName = false; }
    preview();
  }
  form.addEventListener('input', changed, { signal });
  form.addEventListener('change', changed, { signal });
  form.addEventListener('submit', event => {
    event.preventDefault();
    try { getWorkspace().saveColumn(definition(), prerequisites); dialog.close(); render({ revealColumnId: draftId }); }
    catch (failure) { error.textContent = failure.message; }
  }, { signal });
  form.querySelector('[data-cancel]').addEventListener('click', () => dialog.close(), { signal });
  dialog.addEventListener('close', () => {
    const target = editingId ? [...root.querySelectorAll('[data-calculation-menu]')].find(b => b.dataset.calculationMenu === editingId) : returnFocus;
    (target?.isConnected ? target : root.querySelector('#add-calculation')).focus({ preventScroll: true });
  }, { signal });
  menu.addEventListener('toggle', () => { if (!menu.matches(':popover-open')) anchor?.setAttribute('aria-expanded', 'false'); }, { signal });
  window.addEventListener('resize', position, { signal });
  window.addEventListener('scroll', position, { signal, capture: true, passive: true });
  return { close() { closeMenu(); if (dialog.open) dialog.close(); } };
}
