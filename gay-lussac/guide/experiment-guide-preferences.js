// Reading the guide is a browser preference, not part of an experiment record.
export function createExperimentGuidePreferences(getStorage = () => globalThis.localStorage) {
  const prefix = 'gay-lussac.experiment-guide:';
  const memory = new Map();
  const localOnly = new Set();
  const seenKey = runId => `${prefix}seen:${runId}`;
  function read(key) {
    if (localOnly.has(key)) return memory.get(key) === true;
    try { const storage = getStorage(); if (storage) memory.set(key, storage.getItem(key) === 'true'); }
    catch { /* Keep this page usable when browser storage is unavailable. */ }
    return memory.get(key) === true;
  }
  function write(key, value) {
    memory.set(key, value);
    try { getStorage()?.setItem(key, String(value)); localOnly.delete(key); }
    catch { localOnly.add(key); }
  }
  return {
    isSuppressed: () => read(`${prefix}suppressed`),
    setSuppressed: value => write(`${prefix}suppressed`, value),
    shouldShow: runId => !!runId && !read(`${prefix}suppressed`) && !read(seenKey(runId)),
    markSeen(runId) { if (runId) write(seenKey(runId), true); },
    forget(runId) {
      const key = seenKey(runId);
      memory.delete(key);
      try { getStorage()?.removeItem(key); localOnly.delete(key); }
      catch { localOnly.add(key); }
    },
  };
}
