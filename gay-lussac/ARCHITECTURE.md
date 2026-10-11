# 구현 경계와 라이브러리 선택

| 항목 | 내용 |
|---|---|
| 버전·검토일 | GL-ARCH-v0.1 · 2026-10-11 |
| 적용 범위 | `gay-lussac/`의 초보자 모드와 이후 같은 엔진을 사용하는 모드 |
| 관련 문서 | [기획](PLAN.md) · [화면과 구현 설계](DESIGN.md) |
| 현재 상태 | M1 실물 연결 확인. M2 세션·RunStore·트랜잭션·CSV 구현, 실제 브라우저 저장소·재생 자료와 실물 276개 자료의 재연결·복원·CSV 검증 |

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
| 사건 정정·PNG | 종료된 측정 세션이나 자료 변환기가 화면 기능까지 맡을 수 있음 | 사건 정정은 RunStore의 검증·추가 기록, PNG는 차트 어댑터의 출력 |

## 2 상태의 단일 소유자

RunStore는 **현재 열린 실험의 자료와 저장 상태**를 관리하는 모듈이고, Repository는 **실제 DB 읽기·쓰기**를 담당한다. Workspace는 학생이 표와 분석 도구에서 수행하는 작업을 관리한다.

| 소유자 | 소유하는 것 | 다른 모듈에 제공하는 것 |
|---|---|---|
| 앱 제어기 | 현재 화면, 열린 모듈의 참조, 사용자 행동의 호출 순서 | 각 화면에 필요한 상태와 행동 함수 |
| 입력 어댑터 | 장치 연결 시도, 프로토콜 해석, 첫 값 대기·재시도 | 표준 수신 또는 오류 입력 |
| 프로그램 전송 어댑터 | 준비한 HEX, 공식 USB 객체, 전송 작업과 완료 상태 | 일반 진행 상태와 `prepare / install / dispose` 행동 |
| 측정 세션 | 입력 마감, 샘플 번호, 구간과 시간 기준, 진단 실행 상태 | 추가할 샘플·사건 내용, 측정 표시 상태 |
| RunStore | 열린 Run, 사건 ID 할당, 미저장 자료, 저장 상태, 잠금 수명, 일관된 읽기 | 샘플 조회·스냅샷·저장 결과 |
| Repository | DB 연결, 스키마, 인덱스와 트랜잭션 | 일반 데이터와 완료 응답 |
| Workspace | 선택·적용·제외 ID, 계산 열, 축·메모, 작업 revision과 되돌리기 | 직렬화 가능한 작업 복사본과 계산 입력 |
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
| `measurement/transport.js` | 기존 BLE 모듈, 프로파일, 순수 decoder | `reading / parse-error / connection` |
| `measurement/session.js` | 공통 데이터 계약, 진단 규칙, 주입받은 저장 행동·시계 | 샘플·사건·측정 상태 |
| `data/run-store.js` | Repository, 공통 검증 함수, Web Locks·저장 일정 | 스냅샷·저장 상태·완료 응답 |
| `data/repository.js` | IndexedDB와 idb | 일반 레코드, 트랜잭션 결과 |
| `analysis/workspace.js` | 공통 데이터 계약·계산 함수·조회 입력 | 작업 정의·표시 모델·분석 결과 |
| `analysis/calculations.js`, 진단 규칙 | 일반 데이터·숫자·설정 | 일반 결과·이유 코드 |
| `data/files.js` | Papa Parse, 공통 데이터 검증 | CSV·JSON 문자열 또는 검증된 실험 자료 |
| `ui/table-view.js`, `ui/chart-view.js` | 전달받은 표시 모델, DOM·차트 도구 | 샘플 ID를 포함한 행동, PNG |

공통 데이터 계약은 `data/contracts.js`의 JSDoc·검증 함수로 시작한다. 이 파일은 DB·DOM·외부 라이브러리를 가져오지 않는다. 필요한 의존성은 생성 함수의 인자로 전달하며, 범용 주입 컨테이너나 등록 시스템을 먼저 만들지 않는다.

준비 화면의 스타일은 `ui/guide.css`, 공통·측정·분석 스타일은 `styles.css`에서 관리한다. 같은 선택자의 보정 규칙을 파일 끝에 계속 덧붙이지 않고 해당 규칙과 반응형 구간을 갱신한다. ID는 앱의 연결 지점, 명시적인 클래스는 스타일과 표시 재사용에 사용하며 실행 중 ID를 클래스 이름으로 복제하지 않는다. 전환 시간·곡선은 준비 화면의 CSS 변수 한 곳에서 정의한다. 화면 뷰를 해제하면 클릭 이벤트·크기/글꼴 관찰·진행 중 전환을 정리하고 뒤늦은 글꼴 준비 응답도 무시한다.

`IDBDatabase`, idb 객체, Chart 인스턴스, 표 라이브러리의 행 객체는 해당 어댑터 안에 둔다. 저장하는 것은 샘플 ID·열 정의·축·선택·제외·버전이며 라이브러리 설정 객체 전체나 DOM은 저장하지 않는다.

### 3.1 입력과 진단

입력 어댑터는 원문을 프로파일에 따라 다음 두 형태로 변환한다. `receivedAt`과 단조 시각은 실제 콜백 시점의 값을 함께 전달한다.

| 입력 | 내용 | 처리 |
|---|---|---|
| `reading` | 온도·압력·추가 채널·필드별 validity, 연결 시도 ID, 수신 시각 | 세션에서 전달받은 runId와 새 sample/segment ID로 기록 |
| `parse-error` | 오류 종류, 연결 시도 ID, 수신 시각 | 오류 사건과 진단창 초기화에 사용 |

범위 밖 수치도 파싱 가능하면 `reading`으로 보존한다. 유효 구간 이전 수치의 구간 ID·경과시간은 `null`로 둔다. 시작 명령 재시도는 프로파일상 유효한 첫 Reading 이후 종료한다. 실제 값 확인을 위한 3개·1초 조건은 별도의 준비 확인 규칙으로 유지한다.

진단의 공개 형태는 `step(previousState, input, now, config) → { nextState, observation }`이다. 규칙 내부에서 타이머를 만들거나 현재 시각·화면·DB를 직접 읽지 않는다. 세션이 규칙별 상태와 평가 tick을 유지하므로 새 수신이 없는 동안에도 중단을 판단할 수 있다. 기록 종료 시 세션이 평가를 정리한다.

### 3.2 저장·스냅샷·버전

- RunStore의 대기열에 들어온 원자료는 동일 ID로 재시도한다. Repository는 묶음의 트랜잭션 완료 후 확인된 샘플·사건 ID와 메타데이터·작업 revision을 돌려준다.
- 작업 revision 1의 저장 중 revision 2가 생겼다면, 1의 성공은 1까지만 확정한다. revision 2가 남으면 저장 상태는 계속 `pending`이다. 같은 규칙을 변경 가능한 Run 메타데이터에도 적용한다.
- M2의 `getSnapshot()`은 열린 RunStore가 보유한 원자료·Run·사건·Workspace를 한 시점에 복사한다. 처음 열 때 Repository의 한 읽기 트랜잭션에서 전체를 가져오고, 이후 확정 위치와 미저장 변경을 같은 소유자가 관리한다. 따라서 내보내는 도중 DB를 다시 읽거나 화면이 병합할 필요가 없으며, 저장 완료·후속 수신이 이미 만든 스냅샷을 바꾸지 않는다. 열린 실험 전체를 메모리에 보유하는 초기 구현이며 장시간 대용량 실험의 메모리 최적화는 별도 성능 근거를 보고 진행한다.
- 측정 세션은 종료 시점의 입력을 닫고, 앱은 RunStore의 종료 저장을 요청한다. 실패 시 같은 RunStore를 분석 화면으로 연결한다. 앱과 분석 화면이 미저장 배열을 별도로 합치지 않는다.
- 일시정지·재개·추가 측정도 같은 세션과 RunStore 계약을 사용한다. 정지 중 입력은 기존 관찰자에 미리보기로만 전달하고 저장·차트 캐시에 넣지 않는다. 추가 측정 조건 정의·검증은 `measurement/conditions.js`, 팝업 조작은 `ui/additional-dialog.js`가 맡는다. 분석 표는 적용 시점의 복사본을 사용하며 추가 수신이 기존 Workspace를 수정하지 않는다.
- `workspaceRevision`은 저장할 작업 변경을 구분하고, `analysisInputRevision`은 계산 대상·식·축의 변경을 구분한다. 저장 완료와 회귀 유효성은 각각 해당 revision으로 판단한다.

RunStore의 `appendEvent()`가 측정 중 사건과 정정 사건 모두에 실험 내 증가하는 eventId를 부여한다. 세션은 사건 내용을 만들고 확정된 ID를 돌려받는다. 사건 정정은 `RunStore.correctEvent()`로 전달하며, 검증 후 원래 사건 ID를 참조하는 새 정정 기록과 revision을 추가한다. 현재 관찰 표시에는 최신 정정을 적용하고, 당시 진단 근거는 원래 사건을 계속 참조한다. 정정을 위해 종료된 측정 세션을 다시 실행하지 않는다.

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
| 사칙연산·기초 회귀 | 현재 범위의 순수 계산 함수 | 단순 최소제곱, 유효점·R²·x절편 상태 처리 | 추가 패키지 없음 |
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
| 범용 수식·통계·회귀 플러그인 | 사칙연산과 단순 선형회귀에는 직접 제어할 계산 계약을 유지한다. | 통계 도구나 수식 범위를 실제로 확대할 때 |

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
