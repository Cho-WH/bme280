// Preserved copy for the future opt-in help UI. Not imported by the current screen.
// Placeholder values describe runtime counts; this module does not own workspace state.
export const ANALYSIS_HINTS = {
  selection: {
    idle: '행을 체크한 뒤 원하는 작업을 선택하세요. Shift를 누른 채 다른 행을 체크하면 그 사이도 선택됩니다.',
    checked: '선택한 행으로 할 작업을 고르세요. 실행하면 바로 반영되고 체크는 해제됩니다.',
    unchanged: '행을 체크한 뒤 원하는 작업을 선택하세요. 체크만으로 분석 대상은 바뀌지 않아요.',
    readonly: '읽기 전용으로 자료를 확인하고 있습니다. 선택·범위 변경·제외·복원은 작성 중인 탭에서 할 수 있어요.',
    hidden: '현재 보이지 않는 {count}개도 작업 대상입니다.',
  },
  views: {
    all: '원자료의 분석 상태를 확인할 수 있어요. 표 필터는 분석 범위를 바꾸지 않아요.',
    included: '현재 분석에 사용하는 자료만 표시합니다. 원자료 표의 필터와 관계없이 모두 보여요.',
    excluded: '제외한 자료를 모두 표시합니다. 분석 범위 밖인 행은 제외를 해제해도 현재 분석에 추가되지 않아요.',
    selected: '필터나 보기에서 숨겨진 행을 포함해 체크한 자료를 모두 표시합니다.',
  },
  actions: {
    selection: '현재 {before}개 → {after}개 사용 · 선택 {selected}개 중 기존 제외 {excluded}개 유지',
    all: '현재 {before}개 → {after}개 사용. 표에 불러온 {loaded}개가 대상이며, 기존 제외 {excluded}개는 유지됩니다.',
    exclude: '현재 {before}개 → {after}개 사용',
    outsideExclude: '범위 밖 {count}개에도 제외 표시',
    alreadyExcluded: '이미 제외된 {count}개는 유지',
    restore: '{count}개 분석에 복원',
    outsideRestore: '범위 밖 {count}개는 제외 표시만 해제',
    restoredCount: '→ {count}개 사용',
    restoreAll: '제외 표시 {count}개를 해제하면 현재 분석에 {inside}개가 복원됩니다. 범위 밖 자료는 추가하지 않습니다.',
    undo: '범위 변경·제외·복원을 되돌릴 수 있어요.',
  },
  results: {
    newData: '새 자료를 표에 불러왔어요. 현재 분석 범위와 제외 내역은 유지됩니다.',
    selection: '선택한 자료로 분석 범위를 바꿨습니다.',
    all: '표에 불러온 전체 자료로 분석 범위를 바꿨습니다. 기존 제외는 유지됩니다.',
    exclude: '{count}개를 분석에서 제외했습니다.',
    outsideExclude: '범위 밖 {count}개에 제외 표시를 남겼습니다.',
    restore: '{count}개를 분석에 복원했습니다.',
    outsideRestore: '범위 밖 {count}개는 제외 표시만 해제했습니다.',
    restoreAll: '모든 제외 표시를 해제했습니다. 현재 분석 범위는 유지됩니다.',
    undo: '{action} 작업을 되돌렸습니다.',
    redo: '{action} 작업을 다시 실행했습니다.',
    includedCount: '분석에 사용할 자료 {count}개.',
  },
  table: {
    reasonExample: '예: 장치를 움직인 구간',
    mobile: '표를 가로로 밀면 분석 상태·구간·수신 시각·제외 사유를 볼 수 있어요.',
    reasons: '나머지 사유는 각 행에서 확인할 수 있어요.',
    preservation: '원자료는 그대로 보존되며 전체 CSV로 내려받을 수 있어요.',
    empty: '먼저 측정 자료를 불러오세요.',
  },
};
