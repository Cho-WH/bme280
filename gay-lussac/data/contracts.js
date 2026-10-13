export const DATABASE = Object.freeze({ name: 'bme280.gay-lussac', version: 2 });

/** @typedef {{type:'reading', temperatureC:number, pressureHpa:number,
 * extraChannels:{humidityPct:number}, validity:{temperatureC:string,pressureHpa:string,humidityPct:string},
 * attemptId:number, receivedAt:number, monotonicAt:number}} Reading
 * @typedef {{type:'parse-error',reasonCode:string,attemptId:number,receivedAt:number,monotonicAt:number}} ParseError
 * @typedef {{id:string,schemaVersion:number,runRevision:number,name:string,createdAt:number,updatedAt:number,
 * status:'open'|'paused'|'complete'|'interrupted',program:object,profile:object,source:'device'|'replay'|'import',
 * lastSavedSampleId:number,lastSavedEventId:number,importedColumns?:Array<{id:string,name:string,unit:string|null}>}} Run
 * @typedef {{runId:string,sampleId:number,receivedAt:number,
 * temperatureC:number|null,pressureHpa:number|null,validity:object,sourceSampleId?:number,
 * importedValues?:Object<string,{value:number|null,reason:string|null}>}} Sample
 * @typedef {{runId:string,eventId:number,receivedAt:number,
 * type:string,payload:object,source:'user'|'system'}} ExperimentEvent
 */

export const isValidReading = (input) => input?.type === 'reading'
  && input.validity.temperatureC === 'valid' && input.validity.pressureHpa === 'valid';

export function withEventNote(event, note) {
  if (!event || event.source !== 'user') throw new Error('사용자 조작 기록의 메모만 수정할 수 있어요.');
  if (typeof note !== 'string' || note.length > 500) throw new Error('메모는 500자 이내로 입력하세요.');
  return { ...event, payload: { ...event.payload, note: note.trim() } };
}

// Stable source IDs are shared by table projection and calculation validation.
export const SOURCE_COLUMNS = Object.freeze([
  { id: 'sampleId', name: '번호', unit: null },
  { id: 'temperatureC', name: '온도', unit: '℃', calculable: true },
  { id: 'pressureHpa', name: '압력', unit: 'hPa', calculable: true },
  { id: 'receivedAt', name: '수신 시각', unit: null },
]);
export const CALCULATION_OPERATORS = Object.freeze({ '+': '+', '-': '−', '*': '×', '/': '÷', '^': '거듭제곱' });

export function validateImportedColumns(columns = []) {
  if (!Array.isArray(columns)) throw new Error('가져온 자료 열 목록을 확인하세요.');
  const ids = new Set();
  return columns.map(c => {
    if (!c || typeof c.id !== 'string' || !/^data-[\w-]+$/.test(c.id) || ids.has(c.id)
      || typeof c.name !== 'string' || !c.name.trim() || c.name.length > 60
      || (c.unit != null && (typeof c.unit !== 'string' || c.unit.length > 30)))
      throw new Error('가져온 자료 열의 ID·이름·단위를 확인하세요.');
    ids.add(c.id);
    return { id: c.id, name: c.name, unit: c.unit || null };
  });
}

export const graphColumns = (calculated, imported = []) => [...SOURCE_COLUMNS.filter(c => c.id !== 'sampleId'), ...imported, ...calculated];
export const DEFAULT_GRAPH = Object.freeze({ xColumnId: 'temperatureC', yColumnId: 'pressureHpa', type: 'scatter', connectGaps: false, view: 'measured' });
export function validateGraph(graph, calculated = [], imported = []) {
  if (graph == null) return null;
  const ids = new Set(graphColumns(calculated, imported).map(c => c.id));
  if (!ids.has(graph.xColumnId) || !ids.has(graph.yColumnId) || graph.yColumnId === 'receivedAt')
    throw new Error('그래프에 사용할 X축과 Y축을 선택하세요.');
  if (!['scatter', 'line'].includes(graph.type) || (graph.type === 'line' && graph.xColumnId !== 'receivedAt'))
    throw new Error('시간 변화선은 X축이 수신 시각일 때 사용할 수 있어요.');
  return { xColumnId: graph.xColumnId, yColumnId: graph.yColumnId, type: graph.type,
    connectGaps: graph.connectGaps === true, view: graph.view === 'extended' ? 'extended' : 'measured' };
}

/** Validate editable or imported definitions before any state change. No formula evaluation here. */
export function validateCalculatedColumns(definitions, imported = []) {
  if (!Array.isArray(definitions)) throw new Error('계산 열 목록을 확인하세요.');
  const ids = new Set([...SOURCE_COLUMNS, ...imported].map(c => c.id));
  const columns = definitions.map(c => {
    if (!c || typeof c.id !== 'string' || !/^calc-[\w-]+$/.test(c.id) || ids.has(c.id)) throw new Error('계산 열 ID가 올바르지 않거나 중복됩니다.');
    ids.add(c.id);
    if (typeof c.name !== 'string' || !c.name.trim() || c.name.trim().length > 60) throw new Error('열 이름을 1~60자로 입력하세요.');
    if (c.unit != null && (typeof c.unit !== 'string' || c.unit.trim().length > 30)) throw new Error('단위는 30자 이내로 입력하세요.');
    if (!Object.hasOwn(CALCULATION_OPERATORS, c.op)) throw new Error('계산 연산을 선택하세요.');
    return { id: c.id, name: c.name.trim(), unit: c.unit?.trim() || null, lhs: c.lhs, op: c.op, rhs: c.rhs };
  });
  const available = new Set([...SOURCE_COLUMNS.filter(c => c.calculable), ...imported, ...columns].map(c => c.id));
  for (const c of columns) for (const side of ['lhs', 'rhs']) {
    const operand = c[side];
    if (operand?.kind === 'constant' && Number.isFinite(operand.value)) c[side] = { kind: 'constant', value: operand.value };
    else if (operand?.kind === 'column' && available.has(operand.columnId)) c[side] = { kind: 'column', columnId: operand.columnId };
    else throw new Error('A와 B에 자료 열 또는 유한한 숫자를 입력하세요.');
  }
  const byId = new Map(columns.map(c => [c.id, c])), visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error('자기 자신을 참조하거나 계산 열끼리 순환하는 식은 사용할 수 없습니다.');
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    for (const operand of [byId.get(id).lhs, byId.get(id).rhs]) if (operand.kind === 'column') visit(operand.columnId);
    visiting.delete(id); visited.add(id);
  }
  columns.forEach(c => visit(c.id));
  return columns;
}
