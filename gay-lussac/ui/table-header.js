import { columnFilterActive } from '../analysis/table-data.js';

// Owns column layout and header controls; row virtualization stays in DataTable.
export function createTableHeader({ table, onSort, signal }) {
  const header = table.tHead.rows[0];
  let columnsKey = null, columnCount = 0;
  const addColumnHeader = header.querySelector('#add-calculation').closest('th');
  function filterButton(id, name) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.filter = id;
    button.dataset.filterName = name; button.className = 'column-filter-button';
    button.setAttribute('aria-label', name + ' 필터'); button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'column-filter-panel'); button.dataset.workspaceAction = '';
    button.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 4h18l-7 8v7l-4 2v-9z"/></svg>';
    return button;
  }
  function appendColumn(id, label, sortable = false, editable = false, compact = false) {
    const th = document.createElement('th'); th.scope = 'col';
    const controls = document.createElement('div'); controls.className = 'column-header';
    if (sortable) {
      th.dataset.column = id;
      const button = document.createElement('button'); button.type = 'button'; button.dataset.sort = id; button.textContent = label; button.title = label;
      controls.append(button);
    } else {
      controls.append(document.createTextNode(label));
    }
    if (id === 'usage') {
      const help = document.createElement('button'); help.type = 'button';
      help.className = 'help-trigger'; help.dataset.actionHelp = 'tableSelection'; help.textContent = '?';
      help.setAttribute('aria-label', '분석 여부와 자료 체크 도움말'); controls.append(help);
    }
    if (!compact) controls.append(filterButton(id, label));
    if (editable) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.calculationMenu = id;
      button.className = 'calculation-menu-button'; button.title = '계산 열 편집';
      button.innerHTML = '<span class="calculation-edit-icon" aria-hidden="true"></span>';
      button.setAttribute('aria-label', label + ' 계산 열 편집');
      button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'calculation-menu');
      controls.append(button);
    }
    th.append(controls); header.append(th);
  }
  function buildColumns(columns, compact) {
    while (header.cells.length > 1) header.lastElementChild.remove();
    const widths = [32];
    for (const c of columns) {
      appendColumn(c.id, c.label, c.sortable, c.editable, compact); widths.push(c.width);
    }
    // Keep the existing action node and its listeners when the compact view hides it.
    header.append(addColumnHeader); addColumnHeader.hidden = compact;
    if (!compact) widths.push(92);
    const filler = document.createElement('th'); filler.className = 'table-fill'; filler.setAttribute('aria-hidden', 'true');
    header.append(filler);
    columnCount = widths.length + 1;
    table.querySelector('colgroup').replaceChildren(...widths.map(width => {
      const col = document.createElement('col'); col.style.width = width + 'px'; return col;
    }), document.createElement('col'));
    // Only the final empty column absorbs spare viewport width.
    table.style.setProperty('--table-columns-width', widths.reduce((sum, width) => sum + width, 0) + 'px');
  }
  header.addEventListener('click', event => { const button = event.target.closest('[data-sort]'); if (button) onSort(button.dataset.sort); }, { signal });
  return {
    get columnCount() { return columnCount; },
    render({ columns, compact, sort, filter, canEdit }) {
      const key = JSON.stringify({ columns, compact });
      if (columnsKey !== key) { buildColumns(columns, compact); columnsKey = key; }
      for (const th of header.querySelectorAll('[data-column]')) {
        th.setAttribute('aria-sort', th.dataset.column === sort.columnId ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
        th.querySelector('[data-sort]').disabled = !canEdit;
      }
      for (const button of header.querySelectorAll('[data-filter]')) {
        const active = columnFilterActive(filter, button.dataset.filter);
        button.dataset.active = active;
        button.disabled = !canEdit;
        button.setAttribute('aria-label', button.dataset.filterName + ' 필터' + (active ? ' (적용 중)' : ''));
      }
      for (const button of header.querySelectorAll('[data-calculation-menu]')) button.disabled = !canEdit;
    },
  };
}
