export function createDeleteRunDialog(dialog, onConfirm) {
  const form = dialog.querySelector('form');
  const cancel = dialog.querySelector('[data-cancel]');
  const submit = dialog.querySelector('[type=submit]');
  const error = dialog.querySelector('[data-error]');
  let selected, anchor, busy = false;
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => { if (anchor?.isConnected) anchor.focus(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    busy = true; submit.disabled = cancel.disabled = true; error.textContent = '';
    submit.textContent = '삭제 중…';
    try { await onConfirm(selected); dialog.close(); }
    catch (failure) { error.textContent = failure.message; }
    finally { busy = false; submit.disabled = cancel.disabled = false; submit.textContent = '실험 삭제'; }
  });
  return { show(run, button) {
    selected = run; anchor = button; error.textContent = '';
    dialog.querySelector('[data-run-name]').textContent = run.name;
    dialog.showModal(); cancel.focus();
  } };
}
