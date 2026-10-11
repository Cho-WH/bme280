import { ADDITIONAL_CONDITIONS, validateAdditionalConditions } from '../measurement/conditions.js';

export function createAdditionalDialog(dialog, onConfirm) {
  const form = dialog.querySelector('form');
  const fields = dialog.querySelector('[data-conditions]');
  const note = form.elements.note;
  const warning = dialog.querySelector('[data-changed]');
  const error = dialog.querySelector('[data-error]');
  const submit = form.querySelector('[type=submit]');
  for (const { id, label } of ADDITIONAL_CONDITIONS) {
    const row = document.createElement('label'); row.textContent = label;
    const select = document.createElement('select'); select.name = id; select.required = true;
    for (const [value, text] of [['', '변경 여부 선택'], ['same', '변경 없음'], ['changed', '변경됨'], ['unsure', '확실하지 않음']]) {
      const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option);
    }
    row.append(select); fields.append(row);
  }
  const values = () => ({ conditions: Object.fromEntries(ADDITIONAL_CONDITIONS.map(({ id }) => [id, form.elements[id].value])), note: note.value });
  function update() {
    const changed = Object.values(values().conditions).some(value => ['changed', 'unsure'].includes(value));
    note.required = changed; warning.hidden = !changed;
    try { validateAdditionalConditions(values()); submit.disabled = false; }
    catch { submit.disabled = true; }
    error.textContent = '';
  }
  form.addEventListener('input', update);
  form.addEventListener('submit', event => {
    event.preventDefault();
    try { onConfirm(validateAdditionalConditions(values())); dialog.close(); }
    catch (failure) { error.textContent = failure.message; }
  });
  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
  return { show() { form.reset(); update(); dialog.showModal(); } };
}
