export const ADDITIONAL_CONDITIONS = Object.freeze([
  { id: 'container', label: '용기와 기체가 차지하는 부피' },
  { id: 'seal', label: '밀폐 상태와 뚜껑 개방 여부' },
  { id: 'sensor', label: '센서·배선·측정 설정' },
]);

export function validateAdditionalConditions({ conditions, note = '' } = {}) {
  const results = ADDITIONAL_CONDITIONS.map(({ id }) => {
    const result = conditions?.[id];
    if (!['same', 'changed', 'unsure'].includes(result)) throw new Error('각 조건의 변경 여부를 확인해 주세요.');
    return [id, result];
  });
  if (typeof note !== 'string' || note.length > 500) throw new Error('메모는 500자 이내로 적어 주세요.');
  const text = note.trim();
  if (results.some(([, result]) => result !== 'same') && !text) throw new Error('달라졌거나 확실하지 않은 조건을 메모해 주세요.');
  return { conditions: Object.fromEntries(results), note: text };
}
