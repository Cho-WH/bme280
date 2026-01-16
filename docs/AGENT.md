이 레포지토리는 megnetometerbit의 내용을 clone한 것이다. 프로젝트의 목적은 현재 웹앱을 수정하여 BME280 센서를 사용하여 온도, 습도, 기압을 측정하는 웹 애플리케이션을 개발하는 것이다. fireware에는 bme280.js에 수정 펌웨어 초안이 포함되어 있다. 핵심 수정 과제는 다음과 같다

1. x, y, z, strength를 temperature, humidity, pressure를 측정하도록 수정한다.
2. 그래프의 축 스케일을 하나로 고정하지 말고, 각 요소별로 스케일을 다르게 적용한다.

---

## 이슈 보고: 연결은 되나 데이터(그래프/표/CSV)가 0건으로 남는 문제

### 결론(원인)
웹앱(BME280)은 BLE UART로 `bme\n` 커맨드를 전송하고, 수신 데이터는 `temperature,humidity,pressure` **3개 값** CSV 라인만 파싱합니다. 그런데 micro:bit가 **기존 magnetometer 펌웨어**(커맨드 `magnet`, 데이터 4필드 `x,y,z,strength`)를 사용 중이거나, BME280 펌웨어 HEX가 **여전히 4필드를 송신**하는 빌드라면 `parseSample()`이 전부 `null`을 반환해 `state.history`가 갱신되지 않습니다. 그 결과 그래프/로그/CSV가 모두 비어 보입니다.

### 근거(두 프로젝트 비교)
- Magnetometer 프로젝트 정상 흐름
  - 웹: `sendMagnetCommand()` → `"magnet\n"` 전송
  - 펌웨어: `"magnet"` 수신 시 스트리밍 시작, 라인 포맷 `"x,y,z,strength"`
  - 파서: 4필드만 허용
- BME280 프로젝트 현재 흐름
  - 웹: `bme280/js/bluetooth.js`의 `sendBmeCommand()` → `"bme\n"` 전송
  - 파서: `bme280/js/utils/parseSample.js`에서 3필드만 허용 (`segments.length !== 3`이면 drop)
  - 연결 패널: `bme280/js/ui/connection-panel.js`에서 `parseSample()`이 유효 샘플을 반환할 때만 `actions.setSample()` 호출

### 왜 이런 문제가 쉽게 발생하는가(정황)
현재 BME280 레포의 사용자 안내가 아직 magnetometer 펌웨어를 가리키고 있어(문서/가이드) micro:bit에 `magnetometer.hex`를 플래시하는 실수가 발생하기 쉽습니다.
- `bme280/index.html` 사용 안내(Usage Guide)에서 `magnetometer.hex` 다운로드/자기장 설명이 그대로 남아있음
- `bme280/README.md`, `bme280/docs/project-overview.md`도 magnetometer 설명 중심

### 빠른 확인 방법(현장 점검)
- `?mock=1`로 접속했을 때 그래프/표가 정상 갱신되면, UI는 정상이고 “디바이스 데이터 수신/파싱 단계”에서 막힌 것입니다.
- micro:bit LED 표시로 커맨드 수신 여부를 확인:
  - Magnetometer 펌웨어는 `"magnet"` 수신 시 `M` 표시(보정/자기장 스트리밍)
  - BME280 펌웨어는 `"bme"` 수신 시 `B` 표시(환경값 스트리밍)

### 권장 조치
1. micro:bit에 BME280용 HEX(`bme280/firmware/bme_1.0.hex`)를 플래시하고 다시 연결합니다.
2. 만약 이미 BME280 HEX를 플래시했는데도 동일하면, 해당 HEX가 3필드 포맷으로 빌드된 것이 맞는지(온도 중복 등 4필드 잔존 여부) 확인 후 재빌드합니다.
3. 재발 방지를 위해 `bme280/index.html`/`bme280/README.md`의 안내 문구와 다운로드 링크를 BME280 펌웨어로 교체하는 것을 권장합니다.

---

## 이슈 보고(추가): 상단 실시간 수치는 나오지만 그래프/로그가 갱신되지 않는 문제

### 관찰
- `live-stats` 카드(온도/습도/기압)는 “실시간”으로 갱신됨 → `store.dispatch(actions.setSample(...))` 자체는 동작 중
- 그러나 `magnet-chart`(그래프)와 `data-log`(하단 표/CSV)가 갱신되지 않음

### 원인 가설(가능성이 높은 구조적 원인)
`state.js`의 `notify()`는 구독자(listener) 중 **하나라도 예외를 던지면** 그 뒤의 구독자들이 호출되지 않습니다.
즉, 차트 렌더러(`js/ui/magnet-chart.js`)가 특정 입력/상태에서 예외를 던지면:
- 차트는 갱신되지 않고
- 동일한 상태 변경에서 이후 구독자인 로그 테이블(`js/ui/data-log.js`)도 호출되지 않아 표/CSV가 “0건처럼” 보일 수 있습니다.

### 적용한 해결(진단/완화)
- `bme280/js/state.js`: `notify()`에서 각 listener 호출을 `try/catch`로 감싸, 특정 UI 모듈 오류가 전체 렌더를 막지 않도록 변경
- `bme280/js/ui/magnet-chart.js`: `render()`를 `try/catch`로 감싸고, 오류가 나면 차트 영역에 `차트 렌더링 오류: ...` 메시지를 표시하도록 변경

### 다음 액션(원인 확정 및 최종 해결)
1. 페이지를 새로고침 후 다시 연결했을 때, 그래프 영역에 `차트 렌더링 오류:` 메시지가 뜨는지 확인합니다.
2. 메시지가 뜬다면 그 오류 문자열이 “차트가 안 그려지는 직접 원인”입니다(예: 특정 값이 숫자가 아니거나, 데이터 구조가 예상과 다름 등).
3. 위 완화 적용 후에는 차트가 실패하더라도 로그 테이블은 계속 갱신되어야 하므로, 로그가 갱신되는지로 `history` 파이프라인 정상 여부를 분리해서 판단할 수 있습니다.

---

## 관찰된 Chart.js 오류와 원인/해결

### 증상/로그
개발자 도구 콘솔에 아래 오류가 반복되며 차트 렌더가 중단됨.
- `Uncaught Error: Recursion detected: _scriptable->_scriptable`
- `Uncaught TypeError: t.startsWith is not a function`

이 상태에서는 `magnet-chart` 구독자가 예외를 던져 렌더링이 멈출 수 있고, (기존 구현에서는) 같은 state 변경에서 다른 구독자(`data-log`) 호출도 함께 막혀 그래프/로그가 같이 멈춘 것처럼 보일 수 있음.

### 원인(코드 레벨)
`bme280/js/ui/magnet-chart.js`에서 렌더링마다 Chart.js의 `chart.options.scales[...]` 내부(특히 `grid` 같은 중첩 객체)를 동적으로 수정하던 로직이 Chart.js 옵션 resolver(스크립터블 옵션) 처리와 충돌하여 recursion guard가 발동한 것으로 추정됨.

### 적용한 해결
1) 구독자 예외 격리(부수 피해 방지)
- `bme280/js/state.js`: `notify()`에서 각 subscriber를 `try/catch`로 감싸 한 모듈 예외가 전체 UI 업데이트를 막지 않게 함

2) 차트 옵션 수정 방식 변경(직접 원인 제거)
- `bme280/js/ui/magnet-chart.js`: 렌더링 루프에서 중첩 옵션(`scale.grid...`)을 수정하지 않도록 제거하고,
  스케일 표시 여부는 `display` 같은 단순 값만 갱신하도록 단순화

### 확인 방법
- 페이지 새로고침 후 연결 시 콘솔에서 위 Chart.js 에러가 사라지고,
- `온도`가 선택된 상태에서 그래프가 즉시 그려지며,
- 하단 로그 테이블도 동시에 누적되는지 확인
