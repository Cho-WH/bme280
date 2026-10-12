import { SOURCE_COLUMNS, validateCalculatedColumns } from '../data/contracts.js';

const invalid = reason => ({ value: null, reason });
export function calculateValue(a, op, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return invalid('입력값을 계산할 수 없습니다.');
  if (op === '/' && b === 0) return invalid('0으로 나눌 수 없습니다.');
  if (op === '^') {
    if (a === 0 && b === 0) return invalid('0의 0제곱은 계산하지 않습니다.');
    if (a === 0 && b < 0) return invalid('0의 음수 거듭제곱은 계산할 수 없습니다.');
    if (a < 0 && !Number.isInteger(b)) return invalid('음수의 거듭제곱은 정수 지수만 지원합니다.');
  }
  const value = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b
    : op === '/' ? a / b : op === '^' ? a ** b : NaN;
  return Number.isFinite(value) ? { value, reason: null } : invalid('계산 가능한 숫자 범위를 벗어났습니다.');
}

export const columnLabel = c => c.name + (c.unit ? ` (${c.unit})` : '');
export const calculationInputs = (columns, imported = []) => [...SOURCE_COLUMNS.filter(c => c.calculable), ...imported, ...columns];
export const formatCalculated = value => value == null ? '—' : Number(value.toPrecision(6)).toString();

// Compile once per definition change; all rows, previews and future exports share this evaluator.
export function createCalculator(definitions, imported = []) {
  const columns = validateCalculatedColumns(definitions, imported), byId = new Map(columns.map(c => [c.id, c]));
  const labels = new Map(calculationInputs(columns, imported).map(c => [c.id, c.name]));
  const importedIds = new Set(imported.map(c => c.id));
  return sample => {
    const values = {};
    function read(operand) {
      if (operand.kind === 'constant') return { value: operand.value, reason: null };
      const id = operand.columnId;
      if (byId.has(id)) return evaluate(id);
      if (importedIds.has(id)) return sample.importedValues?.[id] ?? invalid(`${labels.get(id)} 값이 없습니다.`);
      return Number.isFinite(sample[id]) && sample.validity?.[id] === 'valid'
        ? { value: sample[id], reason: null } : invalid(`${labels.get(id)} 값이 없거나 유효하지 않습니다.`);
    }
    function evaluate(id) {
      if (Object.hasOwn(values, id)) return values[id];
      const c = byId.get(id), a = read(c.lhs), b = read(c.rhs);
      return values[id] = a.reason ? invalid(a.reason) : b.reason ? invalid(b.reason) : calculateValue(a.value, c.op, b.value);
    }
    columns.forEach(c => evaluate(c.id));
    return values;
  };
}

export function presetColumns(kind, existing, nextId = () => 'calc-' + crypto.randomUUID()) {
  if (!['kelvin', 'ratio'].includes(kind)) throw new Error('추가할 기본 계산을 확인하세요.');
  const added = [];
  // Reuse the definition, including commuted addition, regardless of its display name/unit.
  let kelvin = kind === 'ratio' && existing.find(c => c.op === '+' && [
    [c.lhs, c.rhs], [c.rhs, c.lhs],
  ].some(([a, b]) => a.kind === 'column' && a.columnId === 'temperatureC' && b.kind === 'constant' && b.value === 273.15));
  if (!kelvin) {
    kelvin = { id: nextId(), name: '절대온도', unit: null, lhs: { kind: 'column', columnId: 'temperatureC' }, op: '+', rhs: { kind: 'constant', value: 273.15 } };
    added.push(kelvin);
  }
  if (kind === 'ratio') added.push({ id: nextId(), name: '압력/절대온도', unit: null,
    lhs: { kind: 'column', columnId: 'pressureHpa' }, op: '/', rhs: { kind: 'column', columnId: kelvin.id } });
  return added;
}
