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
  if (!fit) return { equation: '', detail: '' };
  if (fit.reason) return { equation: trendReasons[fit.reason], detail: `사용 ${fit.count}개` };
  const time = regression.timeOrigin !== null;
  const equation = `${model.yLabel} = ${number(fit.slope)} × ${time ? '경과 시간(초)' : model.xLabel} ${fit.intercept < 0 ? '−' : '+'} ${number(Math.abs(fit.intercept))}`;
  const metrics = [fit.rSquared === null ? 'R² —' : `R² ${number(fit.rSquared)}`, `사용 ${fit.count}개`];
  if (time) metrics.push('기준 ' + formatClockTime(clockTime(regression.timeOrigin)));
  if (model.view === 'extended') {
    const absoluteZero = model.xColumnId === 'temperatureC' && model.yColumnId === 'pressureHpa';
    metrics.push(`${absoluteZero ? '절대영도 추정' : time ? '경과 시간의 x절편' : 'x절편'} ${number(fit.xIntercept)}${absoluteZero ? ' ℃' : time ? '초' : ''}`);
    if (fit.xIntercept < fit.minX || fit.xIntercept > fit.maxX) metrics.push('측정 범위 밖 추정');
  }
  if (fit.rSquaredReason) metrics.push(trendReasons[fit.rSquaredReason]);
  else if (fit.xInterceptReason) metrics.push(trendReasons[fit.xInterceptReason]);
  return { equation, detail: metrics.join(' · ') };
}
