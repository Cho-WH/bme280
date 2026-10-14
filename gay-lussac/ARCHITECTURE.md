# 구현 경계와 라이브러리 선택

| 항목 | 내용 |
|---|---|
| 버전·검토일 | GL-ARCH-v0.1 · 2026-10-12 |
| 적용 범위 | `gay-lussac/`의 초보자 모드와 이후 같은 엔진을 사용하는 모드 |
| 관련 문서 | [기획](PLAN.md) · [화면과 구현 설계](DESIGN.md) |
| 현재 상태 | M1·M2와 M3 표 조작·분석 대상·계산 열·그래프 저장 구현. 검증 결과와 한계는 [README](README.md)에서 관리 |

> [!IMPORTANT]
> **각 상태의 작성자는 하나로 정하고, 외부 도구는 정해진 어댑터에서 사용한다.** 화면이나 라이브러리를 바꿔도 원자료·분석 정의·점검 규칙이 유지되는 구조를 구현 기준으로 삼는다.

## 1 검토 결론과 보완한 경계

기획의 준비·측정·저장·분석·점검 구분은 적절하다. 구현 설계에서 아래 소유권과 호출 방향을 더 명확히 했다. 기능 범위와 확정 결정 D1–D5는 유지한다.

| 검토 항목 | 발견한 모호함 | 적용할 경계 |
|---|---|---|
| 미저장 자료 | 앱과 저장소가 모두 버퍼·스냅샷을 소유하는 것으로 읽힘 | 열린 실험의 `RunStore`가 단일 창구. 앱은 참조와 연결 순서만 유지 |
| 실제 DB 접근 | 대기열·잠금·화면 인계와 IndexedDB 호출이 한 책임에 묶임 | `RunStore`는 실험 자료의 수명, `Repository`는 DB 읽기·트랜잭션 |
| 분석 변경 저장 | 작업 v1을 저장하는 동안 생긴 v2까지 저장 완료로 처리할 수 있음 | 작업 revision별 복사본·완료 응답 관리 |
| 진단 상태 | 순수 계산 함수와 내부 상태·타이머 소유의 관계가 불분명 | 규칙은 상태를 입력받아 반환, 세션은 실험별 상태·tick 소유 |
| 입력 변환 | 세션이 원문 파싱과 장치 형식에 결합됨 | 입력 어댑터가 `reading / parse-error`로 변환, 세션은 표준 입력 소비 |
| 조작 메모·PNG | 종료된 측정 세션이나 자료 변환기가 화면 기능까지 맡을 수 있음 | 메모 편집은 RunStore의 검증·저장, PNG는 차트 어댑터의 출력 |

## 2 상태의 단일 소유자

RunStore는 **현재 열린 실험의 자료와 저장 상태**를 관리하는 모듈이고, Repository는 **실제 DB 읽기·쓰기**를 담당한다. Workspace는 학생이 표와 분석 도구에서 수행하는 작업을 관리한다.

| 소유자 | 소유하는 것 | 다른 모듈에 제공하는 것 |
|---|---|---|
| 앱 제어기 | 현재 화면, 열린 모듈의 참조, 사용자 행동의 호출 순서 | 각 화면에 필요한 상태와 행동 함수 |
| 입력 어댑터 | 장치 연결 시도, 프로토콜 해석, 첫 값 대기·재시도 | 표준 수신 또는 오류 입력 |
| 프로그램 전송 어댑터 | 준비한 HEX, 공식 USB 객체, 전송 작업과 완료 상태 | 일반 진행 상태와 `prepare / install / dispose` 행동 |
| 측정 세션 | 입력 마감, 샘플 번호·수신 시각, 진단 실행 상태 | 추가할 샘플·사건 내용, 측정 표시 상태 |
| RunStore | 열린 Run, 사건 ID 할당, 미저장 자료, 저장 상태, 잠금 수명, 일관된 읽기 | 샘플 조회·스냅샷·저장 결과. 마지막 측정값은 `getLatestSample()`로 한 레코드의 복사본만 조회 |
| Repository | DB 연결, 스키마, 인덱스와 트랜잭션 | 일반 데이터와 완료 응답 |
| Workspace | 불러온 자료 경계, 체크·적용·제외 ID, 시간 구간 메타데이터, 계산 열, 관계 축·추세선, 결과 해석의 보관한 근거와 글, 작업 revision과 되돌리기 | 직렬화 가능한 작업 복사본과 계산 입력 |
| 표·차트 어댑터 | DOM·canvas·라이브러리 인스턴스, 렌더링 자원 | 사용자 행동과 표시 결과, PNG |
| 준비 화면 뷰 | 단계·배선표·3D/표 전환의 표시, 단계 버튼 DOM과 이벤트 | 단계 선택·시점 초기화 요청. 실제 단계 이동과 장치 통신은 앱이 실행 |

Workspace가 작업을 수정하면 변경 처리 안에서 RunStore에 **해당 revision의 불변 복사본**을 전달한다. DB 쓰기만 묶어서 지연한다. 같은 변경 가능한 객체를 공유하지 않으며, 원자료의 화면용 캐시와 차트용 점 배열도 읽기·표시용으로만 사용한다.

## 3 의존 방향과 외부 도구의 경계

| 모듈 | 사용할 수 있는 대상 | 바깥으로 전달하는 값 |
|---|---|---|
| `app.js` | 각 모듈의 생성 함수·공개 함수 | 일반 상태, 행동 콜백 |
| `guide/steps.js`, `guide/viewer-adapter.js` | 단계 설정, 기존 3D 프레임의 메시지 계약 | 현재 안내·모델 적용 상태 |
| `guide/programmer-adapter.js` | 프로그램 설정, 공식 USB·HEX 라이브러리, 주입받은 전송 전 행동 | 진행률·완료·실패 상태. BLE·측정 상태를 직접 소유하지 않음 |
| `ui/guide-view.js` | 전달받은 단계·설치 중 여부·뷰어 상태, 준비 화면 DOM, `guide-layout.js` | `render / setBusy / setViewerState / dispose`, 사용자 행동 콜백 |
| `ui/guide-layout.js` | 전달받은 측정 대상과 비활성 표시 요소 생성 함수, DOM 크기·ResizeObserver·애니메이션 | 배선 설명 최소 높이, 선택 표시 위치, 설명 전환. 장치·저장소·앱 상태를 참조하지 않음 |
| `analysis/workspace.js` | RunStore의 읽기 스냅샷·`saveWorkspace()` | 표 범위·선택·적용·제외의 단일 변경 경로, revision, 작업 되돌리기 |
| `analysis/table-data.js` | 샘플과 직렬화 가능한 작업 정의 | 필터 검증·호환 범위 해석, 정렬·필터를 반영한 표 행과 분석 대상 요약. 원자료 불변 |
| `ui/analysis-view.js` | Workspace, 분석 DOM, 표·그래프·열 필터 어댑터 | 원 자료·관계·결과 해석 전환, 한 Workspace·표 유지, 구간 초안·고정 하단 자료 정보 연결, 자료 수·오류 표시 |
| `ui/table-columns.js` | 계산 열 정의·적용된 축 ID | 전체/압축 표의 단일 열 순서·너비 정의. 압축 표도 같은 열 너비를 재사용하고 CSS가 합산된 폭으로 좌우 배치의 표 영역을 정함 |
| `analysis/scope.js` | 자료와 Workspace 정의 | 범위/제외 공통 판정, 시간 경계·포함 ID·저장 구간 검증 |
| `ui/range-selector.js` | 차트의 시간 좌표 변환·자료 스냅샷·확정 콜백 | 저장하지 않는 구간 초안, 양 끝 손잡이·키보드·시간 입력. DB·회귀를 직접 실행하지 않음 |
| `analysis/graph-data.js` | 계산 결과가 있는 원자료·Workspace 정의 | 표 필터와 무관한 분석 점·제외점·유효하지 않은 값 수·시간선 공백. DOM·Chart.js 독립 |
| `analysis/regression.js` | 현재 그래프의 사용 점·입력 revision | 중심화·크기 조정한 최소제곱 회귀, 계수/R²/절편별 유효성, 시간축 초 단위 변환과 실선·연장선 좌표 |
| `analysis/reflection.js` | 분석 정의·샘플·계산 계약 | 근거 캡처·검증·의미 있는 변경 비교·같은 엔진으로 표시 모델 재현 |
| `ui/reflection-view.js` | Workspace·차트/PNG 어댑터·DOM | 근거 카드·작성 칸·조건별 질문·인쇄용 문서, RunStore 저장 상태 표시 |
| `ui/analysis-graph.js` | Workspace 조회·그래프 명령, 차트 어댑터 | 관계 축 즉시 적용, 차트·분석 도구 표시 |
| `ui/trend-controls.js` | Workspace 명령·그래프 표시 모델 | 추세선 토글·보기 범위 전환·식/수치/계산 불가 이유 표시. 분석 대상과 계산을 소유하지 않음 |
| `ui/data-table.js` | 표시할 행·체크 ID·제외 사유 | 분석 포함/범위 밖/제외·확인 중 강조·체크 요청·가상 스크롤. 32px 행 높이를 CSS 변수와 가상화 계산에서 공유 |
| `ui/table-header.js` | 계산 열 정의·정렬·필터·편집 가능 여부 | 열 순서·고정 폭·헤더 버튼 표시와 정렬 요청. 마지막 빈 열만 여백을 흡수하여 헤더 전체 폭과 자료 열 폭을 분리 |
| `ui/column-filters.js` | Workspace 조회·필터 명령, DOM | 공통 헤더 팝업·입력 초안·접근성 상태. 행 투영은 table-data에 위임 |
| `analysis/clock-time.js` | UTC 수신 시각·시각 문자열 | 로컬 시각 표시·입력 해석·날짜 없는 시각 범위 비교 |
| `measurement/transport.js` | 기존 BLE 모듈, 프로파일, 순수 decoder | `reading / parse-error / connection` |
| `measurement/session.js` | 공통 데이터 계약, 진단 규칙, 주입받은 저장 행동·시계 | 샘플·사건·측정 상태 |
| `data/run-store.js` | Repository, 공통 검증 함수, Web Locks·저장 일정 | 스냅샷·저장 상태·완료 응답 |
| `data/repository.js` | IndexedDB와 idb | 일반 레코드, 트랜잭션 결과 |
| `analysis/calculations.js` | 검증된 열 정의·일반 샘플 | 순수 계산 결과·계산 불가 이유, 기본 계산 생성. 화면·저장소 독립 |
| `ui/calculation-editor.js` | Workspace 미리보기·변경 명령, DOM | 추가 메뉴·편집 초안·미리보기·오류. 초안은 저장하지 않음 |
| `ui/anchored-popover.js` | 팝업과 기준 요소 DOM | 열 필터·계산 메뉴의 공통 화면 내 위치 계산 |
| `data/files.js` | Papa Parse, 계산 엔진, 파일 검증 | 전체/분석 CSV·JSON 출력과 JSON 읽기, CSV 파서 공개. 분석 CSV는 스냅샷의 후보·제외 정의를 사용 |
| `data/import-validation.js`, `data/import-run.js` | 공통 계약·표 필터 검증, Repository | 파일의 숫자·ID·계산/축/표 참조 검증, 충돌 ID 교체·출처 보존·원자적 신규 저장. 측정 세션을 실행하지 않음 |
| `data/csv-import.js` | Papa Parse, 공통 열·스냅샷 검증 | 지원 CSV 스키마를 원자료로 변환. 파일 행 순서·빈칸·숫자 열·원본 ID 보존, 오류 시 전체 거부 |
| `ui/file-controls.js` | 파일 변환·다운로드·주입받은 스냅샷/가져오기 행동 | 다운로드 메뉴·계산 열 선택 초안·파일 선택. DB와 측정 수명을 직접 소유하지 않음 |
| `ui/trend-summary.js` | 그래프 표시 모델 | 화면과 PNG가 공유하는 회귀식·계수 단위·회귀 자료 수·계산 불가 이유 |
| `ui/chart-view.js` | 전달받은 표시 모델, Chart.js | 좌우 축 시간 그래프·공유 시각 커서·시간 좌표 변환, 산점도/시간선·점 정보 요청(sampleId 또는 빈 영역의 null). 고정 크기 분석 PNG |

공통 데이터 계약은 `data/contracts.js`의 JSDoc·검증 함수로 시작한다. 이 파일은 DB·DOM·외부 라이브러리를 가져오지 않는다. 필요한 의존성은 생성 함수의 인자로 전달하며, 범용 주입 컨테이너나 등록 시스템을 먼저 만들지 않는다.

준비 완료 이력은 `guide/progress.js`가 실험 ID별 sessionStorage에 보관하는 UI 상태다. 같은 탭의 화면 이동·새로고침에 유지하며 실험 원자료·실시간 준비 판정·파일 복원에 포함하지 않는다. 앱 제어기가 기존 확인 행동과 설치 성공·수신/배터리 검증 결과를 전달하고 준비 뷰는 체크만 표시한다.

준비 화면의 스타일은 `ui/guide.css`, 분석 도구·표 스타일은 `ui/analysis.css`, 공통·측정 스타일은 `styles.css`에서 관리한다. 같은 선택자의 보정 규칙을 파일 끝에 계속 덧붙이지 않고 해당 규칙과 반응형 구간을 갱신한다. ID는 앱의 연결 지점, 명시적인 클래스는 스타일과 표시 재사용에 사용하며 실행 중 ID를 클래스 이름으로 복제하지 않는다. 전환 시간·곡선은 준비 화면의 CSS 변수 한 곳에서 정의한다. 화면 뷰를 해제하면 클릭 이벤트·크기/글꼴 관찰·진행 중 전환을 정리하고 뒤늦은 글꼴 준비 응답도 무시한다.

`IDBDatabase`, idb 객체, Chart 인스턴스, 표 라이브러리의 행 객체는 해당 어댑터 안에 둔다. 저장하는 것은 샘플 ID·열 정의·축·선택·제외·버전이며 라이브러리 설정 객체 전체나 DOM은 저장하지 않는다.

결과 해석은 Workspace의 reflection에 근거 정의 하나와 세 답변을 저장한다. 근거의 자료 ID·제외·축·필요한 계산 의존식·추세선 설정은 가져올 때 복사하며 원자료는 공유한다. analysis/reflection.js가 정의를 검증하고 기존 graphData/fitGraph 엔진으로 재현한다. 현재 분석 변경은 교체 가능 안내만 만들고, 명시적인 가져오기 명령이 근거를 바꾼다. 글과 근거 교체는 분석 이력·분석 입력 revision에서 제외한다. 기존 interpretation 설정은 제거하며 별도 고정 축이나 회귀 엔진을 유지하지 않는다. 구간 메타데이터 analysisRange는 startAt/endAt/throughSampleId이고 appliedIds와 함께 저장·이력·JSON 검증에 포함한다. 구간 초안과 확인 중 점은 화면 상태다.

실험 삭제는 RunStore.remove가 기존 실험 작성 잠금을 보유한 채 Repository.deleteRun을 호출한다. Repository는 runs·samples·events·workspaces를 한 readwrite 트랜잭션에서 삭제하며, 실패하면 전체 취소한다. 삭제 중 변경을 막고 성공한 뒤 저장소 소유권을 해제한다. 목록의 닫힌 실험도 임시 RunStore로 같은 잠금을 획득한다. 삭제 확인창은 UI와 사용자 선택만 소유한다.

### 3.1 입력과 진단

입력 어댑터는 원문을 프로파일에 따라 다음 두 형태로 변환한다. `receivedAt`과 단조 시각은 실제 콜백 시점의 값을 함께 전달한다.

| 입력 | 내용 | 처리 |
|---|---|---|
| `reading` | 온도·압력·추가 채널·필드별 validity, 연결 시도 ID, 수신 시각 | 세션에서 전달받은 runId와 새 sample ID로 기록 |
| `parse-error` | 오류 종류, 연결 시도 ID, 수신 시각 | 오류 사건과 진단창 초기화에 사용 |

범위 밖 수치도 파싱 가능하면 `reading`으로 보존한다. 시작 명령 재시도는 프로파일상 유효한 첫 Reading 이후 종료한다. 실제 값 확인을 위한 3개·1초 조건은 별도의 준비 확인 규칙으로 유지한다.

진단의 공개 형태는 `step(previousState, input, now, config) → { nextState, observation }`이다. 규칙 내부에서 타이머를 만들거나 현재 시각·화면·DB를 직접 읽지 않는다. 세션이 규칙별 상태와 평가 tick을 유지하므로 새 수신이 없는 동안에도 중단을 판단할 수 있다. 기록 종료 시 세션이 평가를 정리한다.

### 3.2 저장·스냅샷·버전

- RunStore의 대기열에 들어온 원자료는 동일 ID로 재시도한다. Repository는 묶음의 트랜잭션 완료 후 확인된 샘플·사건 ID와 메타데이터·작업 revision을 돌려준다.
- 작업 revision 1의 저장 중 revision 2가 생겼다면, 1의 성공은 1까지만 확정한다. revision 2가 남으면 저장 상태는 계속 `pending`이다. 같은 규칙을 변경 가능한 Run 메타데이터에도 적용한다.
- M2의 `getSnapshot()`은 열린 RunStore가 보유한 원자료·Run·사건·Workspace를 한 시점에 복사한다. 처음 열 때 Repository의 한 읽기 트랜잭션에서 전체를 가져오고, 이후 확정 위치와 미저장 변경을 같은 소유자가 관리한다. 따라서 내보내는 도중 DB를 다시 읽거나 화면이 병합할 필요가 없으며, 저장 완료·후속 수신이 이미 만든 스냅샷을 바꾸지 않는다. 열린 실험 전체를 메모리에 보유하는 초기 구현이며 장시간 대용량 실험의 메모리 최적화는 별도 성능 근거를 보고 진행한다.
- 측정 세션은 종료 시점의 입력을 닫고, 앱은 RunStore의 종료 저장을 요청한다. 실패 시 같은 RunStore를 분석 화면으로 연결한다. 앱과 분석 화면이 미저장 배열을 별도로 합치지 않는다.
- 일시정지·재개·추가 측정도 같은 세션과 RunStore 계약을 사용한다. 정지 중 입력은 기존 관찰자에 미리보기로만 전달하고 저장·차트 캐시에 넣지 않는다. 추가 측정 조건 정의·검증은 `measurement/conditions.js`, 팝업 조작은 `ui/additional-dialog.js`가 맡는다. 추가 수신은 기존 Workspace를 수정하지 않는다. M3의 **새 자료 보기**는 RunStore 스냅샷으로 표 경계를 갱신한다. 기본 모드에서는 후보도 불러온 전체 ID로 확장하고, 지정 분석에서는 지정 ID를 유지한다. **이 구간으로 분석 / 전체 자료로 관계 보기**가 모드와 후보 ID를 교체한다. 구간은 확정 당시 자료 경계도 함께 보존한다. 표 자료의 마지막 ID와 적용 ID는 기존 Workspace에 보존해 재접속 때 복원한다. UI가 별도 원자료 저장소나 분석 대상 배열을 소유하지 않는다.
- `workspaceRevision`은 저장할 작업 변경을 구분하고, `analysisInputRevision`은 계산 대상·식·축에 사용하는 열의 변경을 구분한다. 지정 분석의 **새 자료 보기**, 필터·체크, 같은 축의 표시 범위 변경은 작업 revision만 갱신한다. 기본 분석에서 새 자료 보기는 후보를 확장하므로 입력 revision도 갱신한다. 저장 완료와 회귀 유효성은 각각 해당 revision으로 판단한다.

RunStore의 `appendEvent()`가 사건에 실험 내 증가하는 eventId를 부여한다. 세션은 사건 내용을 만들고 확정된 ID를 돌려받는다. `updateEventNote()`는 사용자 조작의 `payload.note`만 갱신하며 종료된 세션을 다시 실행하지 않는다. 메모 편집창은 초안만 소유하고 측정·분석 화면이 같은 표시·편집 함수를 사용한다. 공통 데이터 계약에서 사용자 기록 여부와 메모 길이를 검증한다.

RunStore는 수정된 사건을 기존 Run revision과 함께 저장 대기열에 넣는다. 저장 응답의 revision 이후에 편집한 메모는 다음 묶음에 남기고 실패한 묶음은 그대로 재시도한다. Repository는 현재 Run revision을 확인한 트랜잭션에서 사용자 메모만 덮어쓸 수 있으며 사건의 다른 내용과 원자료 충돌은 거부한다. 별도 DB 저장소 없이 기존 events에 최신 메모를 보관하며 스냅샷·JSON·재열기도 같은 내용을 사용한다.

분석 자료 CSV의 대상도 Workspace의 적용 후보·제외 ID를 RunStore 스냅샷에서 읽어 결정한다. 파일 어댑터는 현재 표의 선택이나 차트에 그린 점에서 대상을 추론하지 않는다. JSON의 계산식은 Workspace 정의로 복원한다. CSV 가져오기는 계산 결과를 Run.importedColumns와 Sample.importedValues의 고정 숫자 열로 취급해 기존 자료·작업 분리를 유지한다. 원본 ID는 sourceSampleId로 보존한다. Workspace는 이 열을 읽어 필터·정렬·계산·그래프에 연결하며 값을 수정하거나 수식으로 추정하지 않는다. 공통 열 검증은 JSON 복원에서도 재사용한다. 별도 파일용 분석 엔진을 만들지 않는다. 포함·복원 규칙은 [구현 설계 §9](DESIGN.md#9-파일과-복원)를 따른다.

### 3.3 계산 열 편집과 계산 엔진

현재 M3는 표 조작·분석 대상·제외/복원·계산 열·그래프까지 구현했다. 작업은 기존 `workspaces` 저장소에 저장한다. DB v2는 폐기한 구간 조회 인덱스만 제거하며 기존 원자료·사건은 보존한다.

- Workspace가 체크·후보·제외·표 범위와 revision을 소유한다. 명령과 체크 해제를 한 revision으로 전달하고, 저장 전달 실패 시 상태·이력을 바꾸지 않는다.
- 기본 분석은 불러온 전체 사용 자료, 지정 분석은 명령 시점의 ID 중 사용 자료다. 이력은 지정·제외·계산 열 정의를 복원하며 현재 필터·표 범위는 유지한다. 사라진 계산 열의 필터·정렬 참조만 정리한다. 기본 모드 복원 시 후보를 현재 표 범위로 맞춘다.
- table-data는 현재 열 필터로 행을 투영한다. 필터를 우회하는 별도 검토 보기나 사용하지 않는 변경 예상 개수 API는 두지 않는다. UI는 분석 대상 배열을 따로 소유하지 않는다.
- 스크롤은 DataTable의 DOM 상태이며 저장하지 않는다. 실험을 새로 열거나 정렬·필터를 바꾸면 표 맨 위로 이동한다.
- 기존 저장본의 부분 후보는 지정 분석으로 보존한다. 이전 단일 숫자 범위·날짜 포함 시각 필터는 읽을 수 있고, 해당 열 편집 시 현재 형식으로 교체한다. 옛 구간 필터·정렬과 스크롤 값은 무시하고 다음 작업 저장에서 제거한다.

계산 열의 현재 구현 계약은 다음과 같다. 분석 그래프와 CSV 출력은 같은 계산 투영을 사용한다.

- 계산 열은 기존 `id / name / unit / lhs / op / rhs` 구조를 유지하고 `op`에 거듭제곱을 포함한다. 구체적인 연산·오류·선택적 단위 계약은 [구현 설계 §7.2](DESIGN.md#72-계산-열과-그래프)를 기준으로 한다. 범용 수식 파서나 별도 단위 계산 엔진은 추가하지 않는다.
- 화면은 연산 선택과 A·B 지정의 초안을 소유한다. 템플릿은 일반 열 정의의 초안을 생성하며, 미리보기·취소는 저장하지 않는다. 확인 시 최종 식이 참조하는 보조 열만 포함해 Workspace의 같은 검증·변경 경로로 적용한다. 필요한 연관 열을 함께 추가할 때도 한 번의 작업·되돌리기로 처리한다.
- `analysis/calculations.js`의 순수 계산 함수를 미리보기·표 표시·파일 출력에서 재사용한다. 연산·유효성 판단을 UI나 프리셋마다 복제하지 않는다. 공통 입력 계약·열 참조 검증은 `data/contracts.js`를 통해 편집 적용과 파일 가져오기에서 공유한다.
- Workspace가 적용한 열 정의를 revision별 복사본으로 RunStore에 전달하고 Repository가 저장하는 기존 방향을 유지한다. 편집 초안·DOM·계산기 버튼 상태는 저장하지 않는다. 계산 열 추가는 이 저장 경로를 재사용한다.
- 계산 결과는 Workspace의 읽기 전용 행 투영으로 제공하며 원자료 레코드에는 넣지 않는다. 원자료 또는 계산 정의가 바뀔 때만 투영 캐시를 갱신하고, 필터·정렬·체크는 같은 결과를 재사용한다. 표·편집창은 반올림 전 값을 계산에 사용하고 표시할 때만 최대 유효숫자 6자리로 줄인다.
- 사용 중인 열의 삭제 검사와 제외·복원은 Workspace가 처리하고, 표·차트는 결과를 표시한다. 프리셋의 묶음 추가·역순 되돌리기와 일반 개별 삭제를 구분하며 의존 열을 자동으로 함께 삭제하지 않는다.

추세선은 기존 선택·사용/제외·지정 분석 명령을 그대로 유지한 채 연결한다. Workspace가 **추세선 표시**의 켜짐/꺼짐과 현재 입력 revision을 소유하고, 켜진 상태에서 실제 분석 입력이 바뀌면 순수 회귀 함수를 자동 실행한다. 분석 축의 계산 열과 그 의존 열만 수치 입력으로 비교한다. 새 자료 보기는 새 스냅샷으로 계산한 작업을 먼저 저장 경로에 전달하고 성공한 뒤 표 자료를 교체한다. 결과는 입력 revision과 함께 저장하되 재열기와 이력 복원 시에는 현재 입력으로 재계산하여 오래된 선·수치를 표시하지 않는다. 그래프 뷰는 토글 요청과 결과 표시, 차트 어댑터는 선·연장 범위 렌더링을 맡는다. 회귀용 대상 ID 배열이나 자동 제외 경로를 별도로 만들지 않는다. 설정·이력·기존 저장본의 기본값과 계산 불가 처리는 [DESIGN §7.3](DESIGN.md#73-회귀-결과와-변경-처리)을 따른다.

### 3.4 분석 도움말과 작업 상태의 분리

`analysis/hints.js`는 현재 화면에서 제거한 힌트 문구와 동적 문구의 자리표시자를 보관한다. DOM·Workspace 의존성이나 표시 코드를 두지 않으며, 현재 화면은 이 모듈을 import하지 않는다. 후속 도움말 UI가 필요할 때만 해당 내용을 연결한다.

짧은 기능 도움말은 `ui/action-help.js`의 `createActionHelp(root, { messages })` 하나로 앱에 연결한다. 문구는 `ui/action-help-content.js`, 공통 버튼·팝오버 스타일은 `ui/action-help.css`에 둔다. 명시적인 `data-action-help` 키만 처리하고 기존 `anchored-popover.js`로 위치를 잡는다. 하나의 표시 요소와 위임 이벤트를 재사용하며 모달 안에서는 같은 요소를 해당 모달로 옮긴다. `close()`와 `dispose()`로 열린 상태·이벤트·관찰자를 정리한다. DOM 표시만 소유하며 Workspace·RunStore·Repository에 의존하지 않는다.

후속 첫 목표·화면 안내, 단계별 목표 힌트, 단계별 수행 안내는 분석 화면의 표시 책임으로 둔다. 내용은 [기획안 §7.4](PLAN.md#74-힌트와-학생의-자유도), 표시·접근성 계약은 [구현 설계 §7.4](DESIGN.md#74-분석-도움말의-표시와-상태)를 따른다.

목표와 수행 안내는 같은 단계 ID의 내용 정의로 연결하고, 버튼 도움말은 해당 행동 ID에 연결한다. 첫 안내와 힌트마다 계산·표·차트 조작을 새로 구현하지 않는다. 필요한 화면 초점 이동은 기존 UI의 행동을 사용하며, 도움말 열람은 Workspace의 자료 선택·계산·revision을 수정하지 않는다. 필수 자료나 장치 조건의 검사는 도움말 열람 여부와 무관하게 기존 모듈이 수행한다.

첫 안내 표시 이력은 기존 로컬 환경 설정, 현재 펼친 도움말은 뷰가 소유한다. 학습 진도 저장소·자동 채점·별도 분석 단계 제어기를 추가하지 않는다. 물음표의 열기·닫기·초점·이벤트 정리는 작은 공통 UI 동작으로 재사용하되, 모든 버튼에 자동으로 툴팁을 붙이는 체계는 만들지 않는다.

## 4 구현 원칙

1. **같은 의미의 상태는 한 곳에서 수정한다.** 다른 화면에는 읽기 모델이나 명령을 제공한다. 표가 정렬되어도 원자료 순서와 적용 ID 집합은 유지한다.
2. **입출력 형태를 먼저 정하고 작은 모듈로 연결한다.** 장치 문자열은 입력 어댑터에서, CSV 문법은 파일 어댑터에서 해석해 공통 데이터로 바꾼다.
3. **물리·통계 규칙은 일반 함수로 둔다.** 판단 근거와 이유 코드를 반환하고, 학생에게 보일 문장은 UI에서 고른다. 같은 입력과 시각을 재생하면 같은 결과를 얻을 수 있게 한다.
4. **화면 해제와 실험 종료를 다른 동작으로 둔다.** 화면의 `dispose()`는 구독·DOM·차트 자원을 정리한다. 통신·저장 대기열·작성 잠금은 실험을 닫는 절차에서 정리한다.
5. **서드파티 도구는 한 경계에서 감싼다.** 화면과 계산 엔진에 라이브러리 전용 객체가 퍼지지 않도록 공개 입력·출력을 일반 데이터로 유지한다.
6. **현재 필요한 재사용부터 만든다.** 같은 계산·저장 계약은 공유하고 실험 문구·점검 설정·배치 안내는 설정으로 둔다. 중급자 모드에서도 기록·저장·분석 엔진을 공유하고 안내량과 노출할 도구를 바꾼다. 실제 두 번째 용도가 생길 때 추가 공통화를 판단한다.
7. **표시 최적화와 분석 대상을 구분한다.** 스크롤 구간 렌더링이나 차트 점 생략이 원자료·회귀·CSV의 입력을 바꾸지 않게 한다.
8. **변경한 동작과 경계를 함께 확인한다.** 결과가 알려진 계산, 저장 중 추가 변경, 단절 후 재개 등 바뀐 계약의 사례를 확인한다. 문서 수정 단계에서는 문서의 일관성과 링크를 확인한다.

## 5 초기 라이브러리 선택

아래는 2026-10-11에 공식 자료와 저장소에서 확인한 선택이다. M1에서 **idb 8.0.4**를 고정했고 기존 Chart.js를 연결했다. M2에서 **Papa Parse 5.7.0**을 고정했다. 배포 파일·해시·라이선스는 [vendor/README.md](vendor/README.md)에 기록한다.

| 영역 | 초기 선택 | 역할·경계 | 버전·라이선스 |
|---|---|---|---|
| 그래프 | 기존 **Chart.js** 재사용 | `ui/chart-view.js`에서 시간 그래프·산점도·회귀선 표시·PNG | 저장소의 **4.5.0 / MIT** [C1] |
| 브라우저 DB | **idb** 추가 | `data/repository.js` 내부에서 IndexedDB를 Promise 방식으로 사용 | **8.0.4 / ISC** [I1], [I2] |
| USB 프로그램 설치 | **@microbit/microbit-connection** | `guide/programmer-adapter.js`에서 공식 USB·HEX API를 사용 | **1.0.0 / MIT**, 포함 의존성·라이선스는 vendor에 기록 [U1] |
| CSV | **Papa Parse** 추가 | `data/files.js`에서 CSV 읽기·쓰기. 실험 스키마 검증은 앱 소유 | **5.7.0 / MIT** [P1], [P2], [P3] |
| 분석 표 | 가상 스크롤 **HTML table** | 선택·정렬·필터 상태는 Workspace, 표는 스크롤 위치 주변 행만 렌더링 | 브라우저 기본 기능 |
| 사칙연산·거듭제곱·기초 회귀 | 현재 범위의 순수 계산 함수 | 계산 열 평가, 단순 최소제곱, 유효점·R²·x절편 상태 처리 | 추가 패키지 없음 |
| 연결·잠금·다운로드 | Web Bluetooth·Web Locks·Blob 등 | 정해진 입력·저장·UI 경계에서 사용 | 브라우저 기능. USB는 공식 라이브러리를 감싼 별도 어댑터 |

### 선택 이유

**idb**는 IndexedDB에 가까운 API와 Promise·`tx.done`을 제공한다. 현재의 네 저장소와 ID 중심 조회에 적용하고, 저장 완료 표시는 `tx.done` 이후 갱신한다. 트랜잭션 안에서는 외부 파일·네트워크 작업을 기다리지 않는다. [I1]

**Papa Parse**는 CSV의 따옴표·줄바꿈·파싱 결과를 처리한다. 초기에는 문자열로 받아 숫자·단위·필수 열·중복 열 이름을 앱에서 검사한다. `parse()`와 `unparse()`를 사용하되 센서 유효성이나 실험 상태를 라이브러리가 결정하게 하지 않는다. [P1]

**Chart.js**의 산점도·선 표시와 PNG 출력 기능을 사용한다. 시간 그래프는 경과 초를 숫자형 `linear` 축에 놓는다. 날짜 전용 `time` 축은 날짜 라이브러리와 adapter가 필요하므로 현재 경과시간 그래프에 추가하지 않는다. PNG 생성은 차트 어댑터, 파일 다운로드는 작은 UI 도우미가 맡는다. [C2], [C3], [C4]

**HTML table**은 원자료 읽기·행 선택·연속 스크롤·계산 결과 표시라는 초기 범위에 맞춘 선택이다. 선택과 필터 규칙은 어차피 Workspace가 소유해야 하므로 첫 버전은 표 렌더러를 작게 유지한다. 이는 현재 기능 범위에 대한 판단이며 성능 측정 결과를 뜻하지 않는다.

## 6 비교한 대안과 도입 조건

| 후보 | 검토 결과 | 다시 고려할 조건 |
|---|---|---|
| **Dexie** | IndexedDB의 스키마·질의를 더 높은 수준으로 다루며 Apache-2.0이다. 현재는 idb 한 종류로 저장 경계를 구현한다. [D1] | 복잡한 실험 검색·질의나 변경 구독을 실제 기능으로 채택할 때 |
| **Tabulator** | 행 선택·정렬·필터·페이지 기능을 제공하는 표 대안. 확인한 후보는 6.6.1 / MIT이다. [T1], [T2] | 표 조작 요구가 늘어 가상 스크롤·클립보드 등 외부 그리드 기능이 실제로 필요해질 때 |
| **AG Grid Community** | MIT인 Community와 별도 상용 Enterprise 기능을 구분해야 한다. 현재 표 범위에는 우선 후보인 HTML table·Tabulator부터 검토한다. [G1] | 표 자체가 더 복잡한 데이터 작업 도구로 확장될 때 |
| **Handsontable** | 비상업 교육·연구용과 상용 사용 조건을 구분하는 라이선스다. 현재 범위를 넘는 셀 편집 중심 기능은 후속으로 둔다. [H1] | 셀 편집·복사 붙여넣기·여러 시트가 실제 요구가 되고 배포 조건이 맞을 때 |
| 범용 수식·통계·회귀 플러그인 | 사칙연산·거듭제곱과 단순 선형회귀에는 직접 제어할 계산 계약을 유지한다. | 통계 도구나 수식 범위를 실제로 확대할 때 |

표 도구를 바꾸더라도 Workspace가 선택·적용·제외 ID의 기준이다. 예를 들어 Tabulator는 정렬·필터·페이지 변경의 선택을 유지하지만 `setData()`에서는 선택을 지운다. 표 내부의 선택만 믿으면 자료 갱신 때 분석 범위가 달라질 수 있으므로, 어댑터가 Workspace의 ID 집합에서 표시를 복원한다. [T1]

## 7 배포와 유지보수

- 기존 Chart.js 고정본은 필요한 기능이 충족되는 범위에서 재사용한다. 새 기능·문제 해결이 필요한 때 버전 변경을 검토한다.
- idb와 Papa Parse는 정확한 버전의 UMD 배포 파일을 `gay-lussac/vendor/`에 보관한다. 버전·공식 출처·해시·라이선스 파일을 함께 기록하고, 실제 포함된 파일을 확인한 뒤 의존성 목록을 갱신한다.
- 빌드 없는 초기 앱에는 공식 브라우저 배포 형식을 사용한다. idb는 ESM·UMD를 제공하고 Papa Parse의 배포본은 UMD이다. 첫 연결은 로컬 UMD 스크립트로 로드하고, `globalThis.idb/Papa/Chart` 접근은 각 어댑터에 한정한다. UMD 파일을 native ESM의 default export로 가정하지 않는다. [I1], [P3]
- 이후 ESM 배포를 선택하면 해당 파일이 참조하는 모듈까지 함께 고정한다. 배포 시 가변 `latest` 주소에 의존하지 않는다.
- 공식 USB 라이브러리는 USB·Universal HEX 진입점만 ESM으로 번들한다. 모바일·Bluetooth 패키지를 추가하지 않는다. `dev/usb-library/`의 고정 lockfile·빌드 스크립트로 재현하며 앱 실행에는 빌드가 필요 없다. 번들·포함 라이선스·출처·해시는 vendor에 보관한다. 전송 엔진과 HEX 해석을 자체 재구현하지 않는다.
- 기존 3D 번들 안의 엔진은 해당 뷰어가 소유한다. 부모 앱에서 별도 3D 엔진을 추가하거나 모델을 복제하는 작업은 현재 경로에 필요하지 않다.
- M1에서 저장 어댑터·기존 차트 연결을, M2에서 CSV 어댑터를 구현했다. M3에서 실제 표 조작 범위를 확인하며 표 도구 추가 여부를 판단한다.

## 8 근거

기존 설계 검토 기준은 [`dd4e618`](https://github.com/Cho-WH/bme280/commit/dd4e6184c3850595faed8bf7c9509f02a9c2763e)이다. 위 보완 사항은 수정된 [DESIGN.md](DESIGN.md)에 연결했다. 라이브러리 도입 판단과 모듈 분리는 이 프로젝트의 설계 결정이다.

- [C1] [저장소의 Chart.js 헤더](../vendor/chart.umd.js) · [4.5.0 라이선스](https://github.com/chartjs/Chart.js/blob/v4.5.0/LICENSE.md).
- [C2] [Chart.js Scatter](https://www.chartjs.org/docs/latest/charts/scatter.html).
- [C3] [Chart.js Time Axis](https://www.chartjs.org/docs/latest/axes/cartesian/time.html).
- [C4] [Chart.js API](https://www.chartjs.org/docs/latest/developers/api.html).
- [I1] [idb 공식 README](https://github.com/jakearchibald/idb).
- [I2] [idb package.json](https://github.com/jakearchibald/idb/blob/main/package.json).
- [U1] [Micro:bit Foundation connection library](https://microbit-foundation.github.io/microbit-connection/).
- [P1] [Papa Parse 공식 문서](https://www.papaparse.com/docs).
- [P2] [Papa Parse 릴리스](https://github.com/mholt/PapaParse/releases/tag/5.7.0).
- [P3] [Papa Parse 5.7.0 소스·배포 형태](https://github.com/mholt/PapaParse/blob/5.7.0/papaparse.js).
- [D1] [Dexie 공식 저장소](https://github.com/dexie/Dexie.js).
- [T1] [Tabulator 선택 상태](https://www.tabulator.info/docs/6.x/select/).
- [T2] [Tabulator 6.6.1 릴리스](https://github.com/tabulator-tables/tabulator/releases/tag/6.6.1) · [MIT 라이선스](https://github.com/tabulator-tables/tabulator/blob/6.6.1/LICENSE).
- [G1] [AG Grid Community와 Enterprise](https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise/).
- [H1] [Handsontable 라이선스 안내](https://handsontable.com/docs/javascript-data-grid/license-key/).

[C1]: ../vendor/chart.umd.js
[C2]: https://www.chartjs.org/docs/latest/charts/scatter.html
[C3]: https://www.chartjs.org/docs/latest/axes/cartesian/time.html
[C4]: https://www.chartjs.org/docs/latest/developers/api.html
[I1]: https://github.com/jakearchibald/idb
[I2]: https://github.com/jakearchibald/idb/blob/main/package.json
[U1]: https://microbit-foundation.github.io/microbit-connection/
[P1]: https://www.papaparse.com/docs
[P2]: https://github.com/mholt/PapaParse/releases/tag/5.7.0
[P3]: https://github.com/mholt/PapaParse/blob/5.7.0/papaparse.js
[D1]: https://github.com/dexie/Dexie.js
[T1]: https://www.tabulator.info/docs/6.x/select/
[T2]: https://github.com/tabulator-tables/tabulator/releases/tag/6.6.1
[G1]: https://www.ag-grid.com/javascript-data-grid/community-vs-enterprise/
[H1]: https://handsontable.com/docs/javascript-data-grid/license-key/
