export function measurementGuidance({ state, placed, heating }, ready) {
  if (state === 'paused') return '기록 일시정지 중 · 현재 값은 보이지만 새 값은 저장되지 않아요. 계속하려면 기록 재개를 누르세요.';
  if (state === 'finishing') return '기록을 마감했어요. 남은 자료를 저장해 주세요.';
  if (state === 'ended') return '측정을 마쳤어요. 자료를 분석하거나 추가 측정으로 기록을 이어갈 수 있어요.';
  if (!ready) return '';
  if (!placed) return '용기를 고정하고 아래에서 배치를 확인해 주세요.';
  if (!heating) return '준비되면 가열을 시작하고 버튼을 눌러 주세요.';
  return '온도와 압력이 어떻게 변하는지 관찰해 보세요.';
}
