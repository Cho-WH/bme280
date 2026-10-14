// Preparation history is UI state, separate from live readiness and experiment data.
export function createGuideProgress(steps, getStorage = () => globalThis.sessionStorage) {
  const known = new Set(steps.map(step => step.id));
  let key = null, completed = new Set();
  const save = () => { try { getStorage()?.setItem(key, JSON.stringify([...completed])); } catch { /* Keep in-memory progress usable. */ } };
  return {
    open(runId) {
      key = `gay-lussac.guide-progress:${runId}`;
      completed = new Set();
      try {
        const saved = JSON.parse(getStorage()?.getItem(key) ?? '[]');
        if (Array.isArray(saved)) completed = new Set(saved.filter(id => known.has(id)));
      } catch { /* Missing or invalid UI history starts empty. */ }
      return [...completed];
    },
    confirm(id) {
      if (!key || !known.has(id) || completed.has(id)) return false;
      completed.add(id); save(); return true;
    },
    clear(ids) {
      for (const id of ids) completed.delete(id);
      if (key) save();
    },
    getCompleted: () => [...completed],
  };
}
