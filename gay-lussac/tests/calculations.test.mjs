import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateValue, createCalculator, presetColumns } from '../analysis/calculations.js';
import { validateCalculatedColumns } from '../data/contracts.js';

const constant = value => ({ kind: 'constant', value });
const column = columnId => ({ kind: 'column', columnId });
const definition = (id, lhs, op, rhs) => ({ id: 'calc-' + id, name: id, unit: '', lhs, op, rhs });

test('arithmetic and powers preserve real results and distinguish invalid boundaries', () => {
  for (const [a, op, b, expected] of [[2, '+', 3, 5], [2, '-', 3, -1], [-2, '*', 3, -6], [1, '/', 4, .25],
    [-2, '^', 3, -8], [4, '^', .5, 2], [2, '^', -2, .25], [0, '^', 2, 0]]) {
    assert.deepEqual(calculateValue(a, op, b), { value: expected, reason: null });
  }
  for (const [a, op, b] of [[1, '/', 0], [0, '^', 0], [0, '^', -1], [-2, '^', .5], [10, '^', 1000], [Infinity, '+', 1]]) {
    const result = calculateValue(a, op, b); assert.equal(result.value, null); assert.ok(result.reason);
  }
});

test('dependency evaluation is independent of column order, retains invalid reasons and optional units', () => {
  const defs = [definition('ratio', column('pressureHpa'), '/', column('calc-k')), definition('k', column('temperatureC'), '+', constant(273.15))];
  assert.equal(validateCalculatedColumns(defs)[0].unit, null);
  const sample = { temperatureC: 25, pressureHpa: 1000, validity: { temperatureC: 'valid', pressureHpa: 'valid' } };
  const calculate = createCalculator(defs), raw = structuredClone(sample);
  assert.equal(calculate(sample)['calc-ratio'].value, 1000 / 298.15);
  sample.validity.temperatureC = 'out-of-range';
  const invalid = calculate(sample); assert.equal(invalid['calc-ratio'].value, null);
  assert.equal(invalid['calc-ratio'].reason, invalid['calc-k'].reason);
  sample.validity.temperatureC = raw.validity.temperatureC; assert.deepEqual(sample, raw);
});

test('validation rejects missing values, forbidden sources, duplicate IDs and cycles without changing input', () => {
  const c = definition('a', constant(2), '+', constant(3));
  for (const defs of [[{ ...c, rhs: constant(null) }], [{ ...c, lhs: column('receivedAt') }], [{ ...c, lhs: column('missing') }],
    [c, c], [{ ...c, lhs: column(c.id) }], [c, definition('b', column(c.id), '+', constant(1)), { ...c, id: 'calc-z', lhs: column('calc-z') }],
    [{ ...c, lhs: column('calc-b') }, definition('b', column(c.id), '+', constant(1))]]) {
    assert.throws(() => validateCalculatedColumns(defs));
  }
  const original = structuredClone(c); validateCalculatedColumns([c]); assert.deepEqual(c, original);
});

test('presets reuse only the matching expression and share the general calculation engine', () => {
  let id = 0; const nextId = () => 'calc-' + ++id;
  const pair = presetColumns('ratio', [], nextId); assert.equal(pair.length, 2);
  const existing = { ...pair[0], name: '다른 이름', unit: null };
  const reused = presetColumns('ratio', [existing], nextId); assert.equal(reused.length, 1);
  assert.equal(reused[0].rhs.columnId, existing.id);
  assert.equal(presetColumns('ratio', [{ ...existing, rhs: constant(2) }], nextId).length, 2);
  const raw = { temperatureC: 0, pressureHpa: 1000, validity: { temperatureC: 'valid', pressureHpa: 'valid' } };
  assert.equal(createCalculator([existing, ...reused])(raw)[reused[0].id].value, 1000 / 273.15);
});
