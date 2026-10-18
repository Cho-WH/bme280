import { createRunNameEditor } from './run-name-editor.js';

// Own list markup and focus; the application performs repository operations.
export function createSavedRunsView(root, { onOpen, onDelete, onRename }) {
  const list = root.querySelector('#saved-runs');
  const setStatus = message => { root.querySelector('#saved-status').textContent = message; };
  function render(runs) {
    list.replaceChildren();
    setStatus(runs.length ? `${runs.length}개의 실험이 이 브라우저에 저장되어 있어요.`
      : '저장된 실험이 없습니다. 새 실험을 시작하면 여기에 기록이 남아요.');
    for (const run of runs) {
      const li = document.createElement('li');
      const label = document.createElement('div'); label.className = 'saved-run-detail';
      const meta = document.createElement('span'); meta.className = 'saved-run-meta';
      meta.textContent = `${run.status === 'complete' ? '측정 완료' : run.status === 'paused' ? '기록 일시정지' : '미완료'} · ${run.lastSavedSampleId.toLocaleString()}개`;
      const button = document.createElement('button'); button.textContent = '열기';
      button.addEventListener('click', () => onOpen(run.id));
      const actions = document.createElement('div'); actions.className = 'saved-run-actions';
      const remove = document.createElement('button'); remove.textContent = '삭제'; remove.className = 'delete-run';
      remove.setAttribute('aria-label', `${run.name} 삭제`);
      remove.addEventListener('click', () => onDelete(run, remove));
      label.append(createRunNameEditor(run, async name => {
        await onRename(run.id, name);
        remove.setAttribute('aria-label', `${name} 삭제`);
      }), meta);
      actions.append(button, remove); li.append(label, actions);
      list.append(li);
    }
  }
  return { render, setStatus, focusHeading() { root.querySelector('#saved-heading').focus({ preventScroll: true }); } };
}
