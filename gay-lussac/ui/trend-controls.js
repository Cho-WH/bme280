import { trendReasons, trendSummary } from './trend-summary.js';

export function createTrendControls(root, { getWorkspace, act, signal }) {
  const $ = id => root.querySelector('#' + id), toggle = $('trend-enabled'), extended = $('trend-extended');
  toggle.addEventListener('change', () => act(() => getWorkspace().setTrendEnabled(toggle.checked)), { signal });
  extended.addEventListener('change', () => act(() => getWorkspace().setGraphView(extended.checked ? 'extended' : 'measured')), { signal });
  return {
    render(model, writable) {
      const enabled = model?.regression?.enabled === true, fit = enabled ? model.regression.result : null;
      toggle.checked = enabled; toggle.disabled = !writable || !model;
      extended.checked = enabled && model?.view === 'extended'; extended.disabled = !writable || !enabled || fit?.xIntercept == null;
      extended.title = !enabled ? '추세선을 먼저 켜 주세요.' : fit?.xIntercept == null ? trendReasons[fit?.reason ?? fit?.xInterceptReason] ?? 'x절편을 계산할 수 없어요.' : '';
      const summary = trendSummary(model);
      $('trend-empty').hidden = enabled && !fit?.reason;
      $('trend-empty').textContent = enabled ? summary.equation : '추세선을 켜면 두 물리량의 관계를 수치로 살펴볼 수 있어요.';
      $('trend-metrics').hidden = !summary.metrics.length;
      $('trend-metrics').replaceChildren(...summary.metrics.map(item => {
        const card = document.createElement('div'), label = document.createElement('span'), value = document.createElement('strong');
        label.textContent = item.label; value.textContent = item.value; card.append(label, value); return card;
      }));
      $('trend-details').hidden = !enabled || Boolean(fit?.reason);
      $('trend-equation').textContent = summary.equation; $('trend-detail').textContent = summary.detail;
    },
  };
}
