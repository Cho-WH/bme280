export function readingStatus(snapshot, connection) {
  const fresh = snapshot.reception.state === 'receiving' && connection.status === 'connected';
  return { fresh, ready: fresh && snapshot.reception.ready };
}

// The UI and commands share these permissions; they do not own experiment state.
export function measurementActions({ saved, run, live, connection, program, busy, profile, supported, secure }) {
  const writable = saved?.writable === true;
  const canRecord = writable && ['idle', 'collecting'].includes(live?.state);
  const hasLiveSession = canRecord || (writable && live?.state === 'paused');
  const canConnectSource = run?.source === 'device' || (run?.source === 'import' && run.importedFrom?.source === 'device'
    && JSON.stringify(run.profile) === JSON.stringify(profile));
  const switching = busy.opening || busy.importing || busy.deleting || busy.renaming;
  return {
    canRecord, hasLiveSession, canConnectSource: Boolean(canConnectSource),
    canConnect: Boolean(hasLiveSession && canConnectSource && !switching && !program.busy && !connection.busy
      && connection.status === 'disconnected' && supported && secure),
    canAddMeasurements: Boolean(canConnectSource && writable && saved.runStatus === 'complete' && saved.status === 'clean'
      && (!live || live.state === 'ended') && !switching && !program.busy && !connection.busy),
    canStartRun: !switching,
  };
}
