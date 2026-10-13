import { formatCalculated } from '../analysis/calculations.js';
import { clockTime, formatClockTime } from '../analysis/clock-time.js';

export const trendReasons = {
  'insufficient-points': '서로 다른 X값을 가진 자료가 2개 이상 필요합니다.',
  'constant-x': 'X값이 모두 같아 추세선을 계산할 수 없습니다.',
  'numeric-range': '값의 크기 때문에 안정적으로 계산할 수 없습니다.',
  'constant-y': 'Y값이 모두 같아 R²를 정의할 수 없습니다.',
  'zero-slope': '기울기가 0이어서 x절편을 계산할 수 없습니다.',
  'unstable-intercept': '기울기가 수치적으로 0에 가까워 x절편을 표시하지 않습니다.',
};
const number = value => formatCalculated(Object.is(value, -0) ? 0 : value);

// Shared with the PNG caption so exported values match the visible analysis.
export function trendSummary(model) {
  const regression = model?.regression, fit = regression?.enabled ? regression.result : null;
  if (!fit) return { equation: '', detail: '', metrics: [] };
  if (fit.reason) return { equation: trendReasons[fit.reason], detail: `회귀 자료 ${fit.count}개`, metrics: [] };
  const time = regression.timeOrigin !== null;
  const equation = `${model.yLabel} = ${number(fit.slope)} × ${time ? '경과 시간(초)' : model.xLabel} ${fit.intercept < 0 ? '−' : '+'} ${number(Math.abs(fit.intercept))}`;
  const slopeUnit = model.xUnit && model.yUnit ? `${model.yUnit}/${model.xUnit}` : '';
  const withUnit = (value, unit) => `${number(value)}${unit ? ' ' + unit : ''}`;
  const items = [{ label: '회귀 자료', value: `${fit.count.toLocaleString()}개` },
    { label: '기울기', value: withUnit(fit.slope, slopeUnit) }, { label: 'y절편', value: withUnit(fit.intercept, model.yUnit) },
    { label: 'R²', value: fit.rSquared === null ? '—' : number(fit.rSquared) }];
  const metrics = items.map(item => `${item.label} ${item.value}`);
  if (time) metrics.push('기준 ' + formatClockTime(clockTime(regression.timeOrigin)));
  if (fit.xIntercept !== null) {
    const absoluteZero = model.xColumnId === 'temperatureC' && model.yColumnId === 'pressureHpa';
    metrics.push(`${absoluteZero ? 'x절편 · 절대영도 추정' : time ? '경과 시간의 x절편' : 'x절편'} ${withUnit(fit.xIntercept, model.xUnit)}`);
    if (fit.xIntercept < fit.minX || fit.xIntercept > fit.maxX) metrics.push('측정 범위 밖 추정');
  }
  if (fit.rSquaredReason) metrics.push(trendReasons[fit.rSquaredReason]);
  else if (fit.xInterceptReason) metrics.push(trendReasons[fit.xInterceptReason]);
  return { equation, detail: metrics.join(' · '), metrics: items };
}
