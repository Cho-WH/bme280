import { hasInvalidValue } from '../analysis/table-data.js';
import { clockTime, formatClockTime } from '../analysis/clock-time.js';
import { formatCalculated } from '../analysis/calculations.js';
import { createTableHeader } from './table-header.js';
import { tableColumns } from './table-columns.js';
import { statusLabels } from '../analysis/scope.js';

const time = value => formatClockTime(clockTime(value)) || '—';
const number = value => Number.isFinite(value) ? value.toFixed(2) : '—';

// Reuses the M2 virtual table: full scroll range, only nearby rows in the DOM.
export function createDataTable({ body, scroller, status, onToggle, onSort, onInspect = () => {} }) {
  const rowHeight = 32, overscan = 8, table = body.closest('table');
  table.style.setProperty('--raw-row-height', `${rowHeight}px`);
  const events = new AbortController(), { signal } = events;
  let rows = [], selected = new Set(), exclusions = new Map(), writable = false, columns = [], compact = false;
  let frame = null, renderedStart = -1, renderedEnd = -1, viewKey = null;
  let applied = null, focusedId = null;
  const header = createTableHeader({ table, onSort, signal });
  function spacer(fragment, count) {
    if (!count) return;
    const row = document.createElement('tr'); row.className = 'table-spacer'; row.setAttribute('aria-hidden', 'true');
    const cell = row.insertCell(); cell.colSpan = header.columnCount; cell.style.height = `${count * rowHeight}px`;
    fragment.append(row);
  }
  function paint() {
    frame = null;
    const first = Math.min(Math.floor(scroller.scrollTop / rowHeight), Math.max(0, rows.length - 1));
    const visibleCount = Math.max(1, Math.ceil(((scroller.clientHeight || 520) - rowHeight) / rowHeight));
    const start = Math.max(0, first - overscan), end = Math.min(rows.length, first + visibleCount + overscan + 1);
    status.textContent = rows.length ? `표시 ${rows.length.toLocaleString()}개 · ${first + 1}–${Math.min(rows.length, first + visibleCount)}번째 행` : '조건에 해당하는 자료가 없어요.';
    if (start === renderedStart && end === renderedEnd) return;
    renderedStart = start; renderedEnd = end;
    const focused = body.contains(document.activeElement) ? document.activeElement.dataset.select : null;
    const focusedRow = body.contains(document.activeElement) ? document.activeElement.dataset.sampleId : null;
    const fragment = document.createDocumentFragment();
    spacer(fragment, start);
    for (let index = start; index < end; index++) {
      const sample = rows[index], id = sample.sampleId, excluded = exclusions.has(id);
      const row = document.createElement('tr'); row.className = 'sample-row'; row.dataset.sampleId = id;
      row.dataset.selected = selected.has(id);
      const usageState = applied && !applied.has(id) ? 'outside' : excluded ? 'excluded' : 'included';
      row.dataset.usage = usageState; row.dataset.focused = id === focusedId;
      row.setAttribute('aria-rowindex', String(index + 2));
      row.tabIndex = 0; row.setAttribute('aria-label', `자료 ${id}, ${statusLabels[usageState]}. Enter로 정보 보기`);
      const cell = row.insertCell(), checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.checked = selected.has(id); checkbox.disabled = !writable;
      checkbox.dataset.select = id; checkbox.setAttribute('aria-label', `자료 ${id} 선택`); cell.append(checkbox);
      const reason = exclusions.get(id);
      const usage = statusLabels[usageState];
      const note = `${hasInvalidValue(sample) ? '값 확인 필요' : '정상 범위'}${excluded ? ' · 제외 기록' : ''}${reason ? ` · ${reason}` : ''}`;
      function cellText(value) { const td = row.insertCell(); td.textContent = String(value); td.title = String(value); return td; }
      for (const c of columns) {
        if (c.editable || c.imported) {
          const result = c.imported ? sample.importedValues[c.id] : sample.calculations[c.id], td = cellText(formatCalculated(result.value));
          td.dataset.calculated = c.id;
          if (result.reason) {
            const detail = document.createElement('button'); detail.type = 'button'; detail.className = 'calculation-error';
            detail.textContent = '—'; detail.dataset.reason = result.reason;
            detail.setAttribute('aria-label', c.name + (c.imported ? ': 값 없음 이유' : ': 계산 불가 이유')); detail.title = result.reason; td.replaceChildren(detail);
            td.title = result.reason;
          } else td.title = String(result.value);
        } else if (c.id === 'usage') cellText(usage).className = 'sample-usage';
        else if (c.id === 'note') cellText(note);
        else if (c.id === 'receivedAt') cellText(time(sample.receivedAt));
        else cellText(c.id === 'sampleId' ? id : number(sample[c.id]));
      }
      if (!compact) row.insertCell(); // Header-only action column.
      const filler = row.insertCell(); filler.className = 'table-fill'; filler.setAttribute('aria-hidden', 'true');
      const compactStatus = document.createElement('span'); compactStatus.className = 'sample-id-status';
      compactStatus.textContent = usage;
      compactStatus.setAttribute('aria-hidden', 'true'); row.cells[1].append(compactStatus);
      fragment.append(row);
    }
    spacer(fragment, rows.length - end);
    if (!rows.length) {
      const row = document.createElement('tr'), cell = row.insertCell(); cell.colSpan = header.columnCount;
      cell.className = 'empty-cell'; cell.textContent = '표에 표시할 자료가 없어요.'; fragment.append(row);
    }
    body.replaceChildren(fragment);
    if (focusedRow) body.querySelector(`[data-sample-id="${focusedRow}"]`)?.focus({ preventScroll: true });
    if (focused) body.querySelector(`[data-select="${focused}"]`)?.focus({ preventScroll: true });
  }
  function schedule() { frame ??= requestAnimationFrame(paint); }
  scroller.addEventListener('scroll', schedule, { passive: true, signal });
  scroller.addEventListener('keydown', event => {
    // Keep Home/End inside the focused virtual table, rather than scrolling the whole page.
    if (event.target !== scroller || event.altKey || event.metaKey || !['Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    scroller.scrollTop = event.key === 'Home' ? 0 : scroller.scrollHeight;
    schedule();
  }, { signal });
  body.addEventListener('click', event => {
    const checkbox = event.target.closest('[data-select]');
    if (checkbox) onToggle(Number(checkbox.dataset.select), { checked: checkbox.checked, extend: event.shiftKey });
    else if (!event.target.closest('button, input')) { const row = event.target.closest('[data-sample-id]'); if (row) onInspect(Number(row.dataset.sampleId)); }
  }, { signal });
  body.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target.matches('[data-sample-id]')) { event.preventDefault(); onInspect(Number(event.target.dataset.sampleId)); }
  }, { signal });
  const observer = new ResizeObserver(schedule); observer.observe(scroller);
  return {
    render({ samples, selectedIds, excluded, appliedIds = null, focusedSampleId = null, sort, filter = {}, calculatedColumns = [], importedColumns = [], axisIds = null, canEdit, resetScroll = false }) {
      applied = appliedIds ? new Set(appliedIds) : null; focusedId = focusedSampleId;
      compact = axisIds !== null; columns = tableColumns(calculatedColumns, axisIds, importedColumns);
      header.render({ columns, compact, sort, filter, canEdit });
      const nextViewKey = JSON.stringify({ sort, filter });
      if (resetScroll || viewKey !== nextViewKey) scroller.scrollTop = 0;
      viewKey = nextViewKey;
      rows = samples; selected = new Set(selectedIds);
      exclusions = new Map(excluded.map(e => [e.sampleId, e.reason])); writable = canEdit;
      renderedStart = renderedEnd = -1; cancelAnimationFrame(frame);
      table.setAttribute('aria-rowcount', String(rows.length + 1));
      paint();
    },
    reveal(sampleId) {
      const index = rows.findIndex(s => s.sampleId === sampleId);
      if (index < 0) return;
      const top = index * rowHeight;
      if (top < scroller.scrollTop || top + rowHeight * 2 > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = top;
      schedule();
    },
    dispose() { observer.disconnect(); events.abort(); cancelAnimationFrame(frame); },
  };
}
