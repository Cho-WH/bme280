import { trendReasons as reasons, trendSummary } from './trend-summary.js';

// Small graph controls only. The Workspace owns activation, calculation and history.
export function createTrendControls(root, { getWorkspace, act, signal }) {
  const $ = id => root.querySelector('#' + id), toggle = $('trend-enabled');
  toggle.addEventListener('change', () => act(() => getWorkspace().setTrendEnabled(toggle.checked)), { signal });
  for (const button of root.querySelectorAll('[data-graph-view]'))
    button.addEventListener('click', () => act(() => getWorkspace().setGraphView(button.dataset.graphView)), { signal });
  return {
    render(model, writable) {
      const regression = model?.regression, enabled = regression?.enabled === true, fit = enabled ? regression.result : null;
      const extended = model?.view === 'extended', canExtend = fit?.xIntercept != null;
      toggle.checked = enabled; toggle.disabled = !writable || !model;
      // Reserve the controls' space even when a narrow layout wraps to two rows.
      $('trend-views').hidden = false; $('trend-views').style.visibility = enabled ? 'visible' : 'hidden';
      for (const button of root.querySelectorAll('[data-graph-view]')) {
        button.setAttribute('aria-pressed', String(button.dataset.graphView === (extended ? 'extended' : 'measured')));
        button.disabled = !writable || (button.dataset.graphView === 'extended' && !canExtend);
        button.title = button.dataset.graphView === 'extended' && !canExtend ? reasons[fit?.xInterceptReason] ?? '' : '';
      }
      const equation = $('trend-equation'), detail = $('trend-detail');
      equation.textContent = ''; detail.textContent = ''; equation.title = ''; detail.title = '';
      const summary = trendSummary(model);
      equation.textContent = summary.equation; detail.textContent = summary.detail;
      equation.title = equation.textContent; detail.title = detail.textContent;
    },
  };
}
