// Inline editing only; the app supplies the existing RunStore save path.
export function createRunNameEditor(run, onSave) {
  const root = document.createElement('div'); root.className = 'run-name-editor';
  const view = document.createElement('div'); view.className = 'run-name-display';
  const text = document.createElement('span'); text.className = 'saved-run-name';
  const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'run-name-icon';
  edit.innerHTML = '<span class="edit-icon" aria-hidden="true"></span>';
  edit.title = '실험 이름 수정';
  const form = document.createElement('form'); form.hidden = true; form.noValidate = true; form.className = 'run-name-form';
  const input = document.createElement('input'); input.type = 'text'; input.maxLength = 120;
  input.setAttribute('aria-label', '실험 이름'); input.autocomplete = 'off';
  const save = document.createElement('button'); save.type = 'submit'; save.className = 'run-name-icon';
  save.setAttribute('aria-label', '이름 저장'); save.title = '저장 (Enter)';
  save.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'run-name-icon';
  cancel.setAttribute('aria-label', '이름 수정 취소'); cancel.title = '취소 (Esc)';
  cancel.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg>';
  let busy = false;
  function display() {
    text.textContent = text.title = run.name;
    edit.setAttribute('aria-label', `${run.name} 이름 수정`);
  }
  function close() { form.hidden = true; view.hidden = false; edit.focus({ preventScroll: true }); }
  edit.addEventListener('click', () => {
    input.value = run.name; input.setCustomValidity(''); view.hidden = true; form.hidden = false;
    input.focus({ preventScroll: true }); input.select();
  });
  cancel.addEventListener('click', close);
  input.addEventListener('input', () => input.setCustomValidity(''));
  form.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); close(); }
    if (event.key === 'Enter' && event.isComposing) event.preventDefault();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    const name = input.value.trim();
    if (!name) { input.setCustomValidity('실험 이름을 입력해 주세요.'); input.reportValidity(); return; }
    busy = true; input.readOnly = true; save.disabled = cancel.disabled = true;
    try { await onSave(name); run.name = name; display(); close(); }
    catch (error) { input.setCustomValidity(error.message); input.reportValidity(); }
    finally { busy = false; input.readOnly = false; save.disabled = cancel.disabled = false; }
  });
  display(); view.append(text, edit); form.append(input, save, cancel); root.append(view, form);
  return root;
}
