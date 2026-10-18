import { axisCalculations } from './calculation-dependencies.js';
import { DEFAULT_GRAPH, validateCalculatedColumns, validateGraph } from '../data/contracts.js';
import { validateAnalysisRange } from './scope.js';
import { createCalculator } from './calculations.js';
import { graphData } from './graph-data.js';
import { fitGraph, trendGeometry } from './regression.js';

export const ANSWER_LIMIT = 1200;
export const REFLECTION_QUESTIONS = Object.freeze([
  { id: 'observation', title: '발견한 관계', question: '두 축의 값 사이에서 어떤 관계를 발견했나요?' },
  { id: 'reasoning', title: '판단한 근거', question: '그래프의 어떤 모습이나 수치가 그 설명을 뒷받침하나요?' },
  { id: 'limitations', title: '해석과 한계', question: '이 자료로 설명하기 어려운 점이나 다시 확인하고 싶은 점은 무엇인가요?' },
]);
const copy = structuredClone;
const requireValue = (ok, message) => { if (!ok) throw new Error('결과 해석: ' + message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function captureEvidence(state) {
  const graph = state.graph ?? DEFAULT_GRAPH, ids = new Set(state.appliedIds);
  return copy({ tableLastSampleId: state.tableLastSampleId, appliedIds: [...ids].sort((a, b) => a - b),
    appliedScope: state.appliedScope, analysisRange: state.analysisRange ?? null,
    exclusions: state.exclusions.filter(e => ids.has(e.sampleId)).sort((a, b) => a.sampleId - b.sampleId),
    calculatedColumns: axisCalculations(graph, state.calculatedColumns), graph,
    regression: { enabled: state.regression?.enabled === true } });
}

export function evidenceKey(evidence) {
  if (!evidence) return '';
  // Loading more samples outside a fixed scope is not a change to its evidence.
  const { tableLastSampleId, analysisRange, ...content } = evidence;
  return JSON.stringify({ ...content, analysisRange: analysisRange ? { startAt: analysisRange.startAt, endAt: analysisRange.endAt } : null });
}

export function validateAnswers(value) {
  requireValue(object(value), '작성 내용을 확인하세요.');
  return Object.fromEntries(REFLECTION_QUESTIONS.map(({ id }) => {
    const text = value[id];
    requireValue(typeof text === 'string' && text.length <= ANSWER_LIMIT, `각 답변은 ${ANSWER_LIMIT}자 이내로 작성하세요.`);
    return [id, text];
  }));
}

export function validateReflection(value, samples, imported = []) {
  if (value == null) return { evidence: null, answers: Object.fromEntries(REFLECTION_QUESTIONS.map(q => [q.id, ''])) };
  requireValue(object(value), '저장 형식을 확인하세요.');
  const answers = validateAnswers(value.answers);
  if (value.evidence == null) return { evidence: null, answers };
  const e = value.evidence, max = samples.at(-1)?.sampleId ?? 0;
  requireValue(object(e) && Number.isSafeInteger(e.tableLastSampleId) && e.tableLastSampleId > 0 && e.tableLastSampleId <= max,
    '근거 그래프의 자료 경계를 확인하세요.');
  const ids = values => Array.isArray(values) && values.every(id => Number.isSafeInteger(id) && id > 0 && id <= e.tableLastSampleId)
    && new Set(values).size === values.length;
  requireValue(ids(e.appliedIds) && e.appliedIds.length > 0 && ['all', 'selection'].includes(e.appliedScope), '근거 자료 ID를 확인하세요.');
  const applied = new Set(e.appliedIds), available = new Set(samples.map(s => s.sampleId));
  requireValue(e.appliedIds.every(id => available.has(id)), '없는 자료를 근거로 참조하고 있습니다.');
  requireValue(e.appliedScope !== 'all' || samples.filter(s => s.sampleId <= e.tableLastSampleId).every(s => applied.has(s.sampleId)), '전체 근거 자료의 범위를 확인하세요.');
  requireValue(Array.isArray(e.exclusions) && ids(e.exclusions.map(x => x?.sampleId))
    && e.exclusions.every(x => applied.has(x.sampleId) && typeof x.reason === 'string' && x.reason.length <= 200), '제외 자료·사유를 확인하세요.');
  const columns = validateCalculatedColumns(e.calculatedColumns, imported), graph = validateGraph(e.graph, columns, imported);
  requireValue(graph && object(e.regression) && typeof e.regression.enabled === 'boolean', '근거 그래프·추세선을 확인하세요.');
  requireValue(e.regression.enabled || graph.view !== 'extended', '연장선에는 추세선이 필요합니다.');
  return { answers, evidence: { tableLastSampleId: e.tableLastSampleId, appliedIds: [...e.appliedIds].sort((a, b) => a - b),
    appliedScope: e.appliedScope, analysisRange: validateAnalysisRange(e.analysisRange, samples, e),
    exclusions: copy(e.exclusions).sort((a, b) => a.sampleId - b.sampleId), calculatedColumns: copy(axisCalculations(graph, columns)),
    graph, regression: { enabled: e.regression.enabled } } };
}

// Reuse the same graph and regression engines. No derived values are trusted from files.
export function evidenceGraph(samples, evidence, imported = []) {
  if (!evidence) return null;
  const calculate = createCalculator(evidence.calculatedColumns, imported), ids = new Set(evidence.appliedIds);
  const rows = samples.filter(s => ids.has(s.sampleId)).map(s => ({ ...s, calculations: calculate(s) }));
  const model = graphData(rows, evidence, imported);
  const regression = evidence.regression.enabled ? fitGraph(model, 0) : { enabled: false };
  const trend = trendGeometry(regression, model.view === 'extended');
  return { ...model, regression, trend, view: model.view === 'extended' && !trend.intercept.length ? 'measured' : model.view };
}
