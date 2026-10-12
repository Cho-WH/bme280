import { validateExperimentSnapshot } from './import-validation.js';

// Import records in one atomic write, without replaying them through a live session.
export async function importRun({ repository, snapshot, newId = () => crypto.randomUUID(), now = () => Date.now() }) {
  const data = validateExperimentSnapshot(snapshot), original = data.run;
  const id = await repository.readRun(original.id) ? newId() : original.id;
  data.run = { ...original, id, source: 'import', runRevision: 1,
    importedFrom: { runId: original.id, source: original.importedFrom?.source ?? original.source, importedAt: now() },
    lastSavedSampleId: data.samples.length, lastSavedEventId: data.events.length };
  for (const record of [...data.samples, ...data.events]) record.runId = id;
  if (data.workspace) data.workspace.runId = id;
  await repository.commitBatch({ ...data, baseRunRevision: 0, insertOnly: true });
  return id;
}
