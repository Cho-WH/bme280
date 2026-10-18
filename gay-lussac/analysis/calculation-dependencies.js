import { DEFAULT_GRAPH } from '../data/contracts.js';

// Retain only definitions used by the axes, including transitive dependencies.
export function axisCalculations(graph, columns) {
  const byId = new Map(columns.map(c => [c.id, c])), needed = new Set();
  function visit(id) {
    if (needed.has(id) || !byId.has(id)) return;
    needed.add(id);
    for (const operand of [byId.get(id).lhs, byId.get(id).rhs]) if (operand.kind === 'column') visit(operand.columnId);
  }
  graph ??= DEFAULT_GRAPH;
  [graph.xColumnId, graph.yColumnId].forEach(visit);
  return columns.filter(c => needed.has(c.id));
}
