import { createRepository } from '../data/repository.js';
import { openRunStore } from '../data/run-store.js';
import { createSession } from '../measurement/session.js';
import { PROGRAM } from '../program-config.js';
import { decode } from '../measurement/decoder.js';

const timers = { setTimeout: () => 1, clearTimeout() {} };
const check = (condition, message) => { if (!condition) throw new Error(message); };
const at = 1700000000000;
const reading = ms => ({ ...decode(`${25 + ms / 20000},0,${1000 + ms / 6000}`, PROGRAM.profile),
  attemptId: 1, receivedAt: at + ms, monotonicAt: ms });
document.getElementById('test').addEventListener('click', async () => {
  const list = document.getElementById('results'); list.replaceChildren();
  const report = text => { const li = document.createElement('li'); li.textContent = text; list.append(li); };
  const repo = createRepository({ databaseName: 'bme280.gay-lussac.tests' });
  let store, reader, reopened;
  try {
    store = await openRunStore({ repository: repo, create: true, program: PROGRAM, source: 'replay', timers });
    const session = createSession({ store }); session.acceptInput(reading(0)); await store.flush();
    const snapshot = await repo.readSnapshot(store.getState().id);
    check(snapshot.samples.length === 1 && snapshot.run.lastSavedSampleId === 1, '트랜잭션 저장 위치 불일치');
    report('통과: 원자료·사건·메타데이터를 같은 트랜잭션에서 저장');
    const batch = { run: snapshot.run, samples: snapshot.samples, events: snapshot.events, workspace: null,
      baseRunRevision: 0 };
    await repo.commitBatch(batch);
    check((await repo.readSnapshot(snapshot.run.id)).samples.length === 1, '재시도 중복');
    report('통과: 동일 묶음 재시도에 중복 없음');
    let rejected = false;
    try { await repo.commitBatch({ ...batch, baseRunRevision: snapshot.run.runRevision,
      run: { ...snapshot.run, runRevision: snapshot.run.runRevision + 1, lastSavedSampleId: 2 },
      samples: [{ ...snapshot.samples[0], sampleId: 2 }, { ...snapshot.samples[0], pressureHpa: 900 }] }); }
    catch { rejected = true; }
    const after = await repo.readSnapshot(snapshot.run.id);
    check(rejected && after.samples.length === 1 && after.run.runRevision === snapshot.run.runRevision, '원자료 충돌 시 전체 rollback 실패');
    report('통과: 원자료 충돌 시 묶음 전체 취소, 기존 값 보존');
    reader = await openRunStore({ repository: repo, id: snapshot.run.id, timers });
    check(!reader.getState().writable, '두 번째 작성자 차단 실패');
    report('통과: 같은 실험의 두 번째 작성자는 읽기 전용');
    await reader.close(); await store.close();
    reopened = await openRunStore({ repository: repo, id: snapshot.run.id, timers });
    check(reopened.getState().writable, '잠금 해제 후 재획득 실패');
    const next = createSession({ store: reopened }); next.acceptInput(reading(500)); await next.finish();
    const final = await repo.readSnapshot(snapshot.run.id);
    check(final.samples[1].sampleId === 2 && final.samples[1].segmentId === 2 && final.run.status === 'complete', '재개 또는 종료 저장 실패');
    report('통과: 재개 구간·샘플 ID·종료 상태 복원');
    next.startAdditional({ conditions: { container: 'same', seal: 'same', sensor: 'same' } });
    next.acceptInput(reading(1000)); await next.pause(); next.acceptInput(reading(1500));
    const paused = await repo.readSnapshot(snapshot.run.id);
    check(paused.run.status === 'paused' && paused.samples.length === 3, '일시정지 중 자료가 기록됨');
    await reopened.close();
    reopened = await openRunStore({ repository: repo, id: snapshot.run.id, timers });
    const restored = createSession({ store: reopened }); restored.acceptInput(reading(2000));
    check(restored.getState().state === 'paused' && reopened.getState().sampleCount === 3, '일시정지 복원 실패');
    restored.resume(); restored.acceptInput(reading(2500)); await restored.finish();
    const continued = await repo.readSnapshot(snapshot.run.id);
    check(continued.samples.length === 4 && continued.samples[3].segmentId === 4
      && continued.events.some(e => e.type === 'additional-measurement' && e.payload.previousLastSampleId === 2), '추가 측정 조건·재개 구간 보존 실패');
    report('통과: 추가 측정 조건 저장·일시정지 복원·미리보기 제외·새 구간 재개');
  } catch (error) { report(`실패: ${error.message}`); }
  finally { store?.dispose(); reader?.dispose(); reopened?.dispose(); repo.close(); }
});

document.getElementById('fixture').addEventListener('click', async () => {
  const output = document.getElementById('fixture-result');
  const repo = createRepository(); let store;
  try {
    let ms = 0;
    store = await openRunStore({ repository: repo, create: true, program: PROGRAM, source: 'replay',
      name: '재생 검증 자료 · M2 복원 확인', timers });
    const session = createSession({ store, clock: { utc: () => at + ms, mono: () => ms } });
    session.markEvent('placement');
    for (ms = 0; ms < 62000; ms += 100) {
      session.acceptInput(reading(ms));
      if (ms === 1000) session.markEvent('heating-start');
      if (ms === 30000) session.markEvent('water-added');
    }
    session.disconnected();
    for (ms = 68000; ms < 70000; ms += 100) session.acceptInput({ ...reading(ms), attemptId: 2 });
    await store.flush();
    const link = document.createElement('a');
    link.href = `../#/analysis?run=${store.getState().id}`; link.textContent = '앱에서 미완료 재생 자료 열기';
    output.replaceChildren(link);
    await store.close();
  } catch (error) { output.textContent = error.message; }
  finally { store?.dispose(); repo.close(); }
});
