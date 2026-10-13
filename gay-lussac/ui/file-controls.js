import { analysisExportInfo, buildCsv, buildAnalysisCsv, buildExperimentJson, parseExperimentJson, parseExperimentCsv } from '../data/files.js';
import { columnLabel } from '../analysis/calculations.js';
import { downloadText, downloadUrl } from './download.js';
import { positionPopover } from './anchored-popover.js';

// File UI owns menu/dialog drafts only. Snapshots and import lifetime come from the app.
export function createFileControls({ getSnapshot, canExportGraph, exportPng, importSnapshot, onMessage, onError }) {
  const $ = id => document.getElementById(id), events = new AbortController(), { signal } = events;
  const menu = $('download-menu'), button = $('download-menu-button'), dialog = $('analysis-export-dialog');
  let csvSnapshot = null, importBusy = false, returnAnchor = button;
  const filename = (snapshot, suffix) => {
    const name = snapshot.run.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 60);
    const day = new Date(snapshot.run.createdAt).toISOString().slice(0, 10);
    return `gay-lussac-${name}-${day}${suffix}`;
  };
  const closeMenu = () => { if (menu.matches(':popover-open')) menu.hidePopover(); };
  const act = async action => { try { await action(); } catch (error) { onError(error.message); } };
  function closeDialog() { dialog.close(); csvSnapshot = null; returnAnchor.focus(); }
  function refreshMenu() {
    const snapshot = getSnapshot(), info = snapshot && analysisExportInfo(snapshot);
    $('export-csv').disabled = !snapshot?.samples.length;
    $('export-analysis-csv').disabled = !info?.rows.length;
    $('export-png').disabled = !canExportGraph();
    $('export-png').title = canExportGraph() ? '' : '자료 분석에서 그래프를 만든 뒤 다운로드하세요.';
    $('export-json').disabled = !snapshot;
  }
  menu.addEventListener('beforetoggle', event => { if (event.newState === 'open') refreshMenu(); }, { signal });
  menu.addEventListener('toggle', () => positionPopover(menu, button), { signal });
  window.addEventListener('resize', () => positionPopover(menu, button), { signal });
  window.addEventListener('scroll', closeMenu, { signal, capture: true });
  window.addEventListener('hashchange', closeMenu, { signal });
  function exportFile(kind, anchor = button) {
    closeMenu();
    return act(() => {
      const snapshot = getSnapshot();
      if (!snapshot) throw new Error('먼저 실험을 열어 주세요.');
      if (kind === 'csv') {
        downloadText(buildCsv(snapshot), filename(snapshot, '.csv'));
        onMessage('전체 원자료 ' + snapshot.samples.length + '개의 CSV 다운로드를 요청했어요.');
      } else if (kind === 'json') {
        downloadText(buildExperimentJson(snapshot), filename(snapshot, '.json'), 'application/json;charset=utf-8');
        onMessage('이어하기용 파일 다운로드를 요청했어요. 시작 화면의 실험 파일 열기에서 다시 열 수 있어요.');
      } else if (kind === 'png') {
        downloadUrl(exportPng(snapshot.run.name), filename(snapshot, '-graph.png'));
        onMessage('현재 그래프의 PNG 다운로드를 요청했어요.');
      } else if (kind === 'analysis-csv') {
        csvSnapshot = snapshot; returnAnchor = anchor;
        const info = analysisExportInfo(csvSnapshot);
        $('analysis-export-count').textContent = '분석 범위 ' + info.candidateCount + '개 − 제외 ' + info.excludedCount + '개 = 출력 ' + info.rows.length + '행';
        $('analysis-export-columns').replaceChildren(...info.columns.map(column => {
          const label = document.createElement('label'), input = document.createElement('input');
          input.type = 'checkbox'; input.value = column.id; input.checked = true;
          label.append(input, document.createTextNode(columnLabel(column))); return label;
        }));
        if (!info.columns.length) $('analysis-export-columns').textContent = '만든 계산 열이 없습니다.';
        dialog.showModal();
      }
    });
  }
  for (const kind of ['csv', 'json', 'png', 'analysis-csv'])
    $('export-' + kind).addEventListener('click', () => { void exportFile(kind); }, { signal });
  $('cancel-analysis-export').addEventListener('click', closeDialog, { signal });
  dialog.addEventListener('close', () => { csvSnapshot = null; }, { signal });
  $('analysis-export-form').addEventListener('submit', event => {
    event.preventDefault(); void act(() => {
      const ids = [...$('analysis-export-columns').querySelectorAll('input:checked')].map(input => input.value);
      downloadText(buildAnalysisCsv(csvSnapshot, ids), filename(csvSnapshot, '-analysis.csv'));
      onMessage(`분석 자료 ${analysisExportInfo(csvSnapshot).rows.length}행의 CSV 다운로드를 요청했어요.`);
      closeDialog();
    });
  }, { signal });
  $('import-file').addEventListener('click', () => { if (!importBusy) $('import-file-input').click(); }, { signal });
  $('import-file-input').addEventListener('change', () => { void act(async () => {
    const file = $('import-file-input').files[0]; $('import-file-input').value = '';
    if (!file || importBusy) return;
    importBusy = true; $('import-file').disabled = true;
    $('import-file-message').hidden = true; $('import-file-message').textContent = '';
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('현재는 50MB 이하의 CSV·JSON 파일을 열 수 있어요.');
      const csv = /\.csv$/i.test(file.name);
      if (!csv && !/\.json$/i.test(file.name)) throw new Error('CSV 또는 전체 실험 JSON 파일을 선택하세요.');
      const text = await file.text();
      let snapshot;
      if (csv) snapshot = parseExperimentCsv(text, { filename: file.name });
      else {
        try { snapshot = parseExperimentJson(text); }
        catch (cause) { throw new Error('파일 내용을 읽을 수 없어요. 앱에서 저장한 이어하기용 원본 파일로 다시 시도해 주세요.', { cause }); }
      }
      await importSnapshot(snapshot);
      onMessage(csv ? `CSV의 ${snapshot.samples.length}행을 새 실험으로 열었어요.`
        : '실험 파일을 열었어요. 원자료와 분석 작업을 복원했습니다.');
    } catch (error) {
      $('import-file-message').textContent = error.message; $('import-file-message').hidden = false;
    } finally { importBusy = false; $('import-file').disabled = false; }
  }); }, { signal });
  return { export: exportFile, dispose() { events.abort(); closeMenu(); dialog.close(); } };
}
