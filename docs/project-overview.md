# MagnetBit 프로젝트 개요

## 1. 프로젝트 소개
- **목표**: micro:bit에서 Nordic UART(BLE)로 송신하는 자기장 데이터를 웹앱에서 실시간으로 시각화하고 CSV 형태로 저장합니다.
- **구성**: 정적 HTML/CSS/JavaScript 기반(single-page) 웹앱과 micro:bit용 펌웨어 바이너리(`firmware/magnetometer.hex`) 및 참고 소스(`firmware/v1.1-mg.js` 등)를 함께 보관합니다.

## 2. 저장소 구조 요약
```
MagnetBit/
├── index.html           # 메인 페이지
├── styles.css           # 전역 스타일
├── vendor/chart.umd.js # Chart.js UMD 번들
├── js/
│   ├── app.js          # 부트스트랩 및 UI 모듈 초기화
│   ├── bluetooth.js    # Web Bluetooth 헬퍼 (동적 특성 탐색 포함)
│   ├── dialog-polyfill.js # HTMLDialogElement 미지원 환경용 폴리필
│   ├── state.js        # 전역 상태 스토어
│   ├── mockTelemetry.js# ?mock=1 시 랜덤 데이터 주입
│   ├── ui/             # 섹션별 렌더링 모듈
│   └── utils/          # 파서·포맷터·CSV 유틸리티
├── firmware/
│   ├── v-mg.js         # 자기장 측정 전용 micro:bit 펌웨어(old)
│   ├── v1.1-mg.js      # 자기장 측정 전용 micro:bit 펌웨어(lastest)
│   └── magnetometer.hex# 자기장 측정 전용 micro:bit 펌웨어를 빌드한 HEX 파일
└── docs/
    └── project-overview.md # 현재 문서
```

## 3. 실행 전 준비
1. **micro:bit 펌웨어 업로드**
   - `firmware/magnetometer.hex`를 micro:bit 드라이브로 복사해 플래시합니다.
   - 필요 시 MakeCode로 커스터마이징하려면 `firmware/v1.1-mg.js`를 열어 재빌드할 수 있습니다. 빌드 결과를 HEX로 내보내 프로젝트에 다시 반영합니다.
2. **웹앱 호스팅**
   - 정적 서버에서 루트(`index.html`)를 서빙합니다. 예: `python3 -m http.server 8000`.
   - Web Bluetooth 제약 때문에 `https://` 또는 `http://localhost`에서 접근해야 합니다.

## 4. 웹앱 사용법
1. Chromium 계열 브라우저에서 페이지를 연 뒤 상단 **디바이스 연결** 버튼을 클릭합니다.
2. 장치 선택 창에서 `BBC micro:bit`를 선택합니다. 앱은 BLE 특성 권한을 자동으로 판별해 알림/쓰기 채널을 구성합니다.
3. 연결되면 실시간 카드, 차트, 로그 테이블에서 자기장 데이터를 확인하고, 필요 시 CSV를 내려받습니다.
4. 연결 해제 시 **연결 해제** 버튼을 누르거나 micro:bit 전원을 분리합니다.

## 5. 모듈 상세 설명

### 5.1 핵심 스크립트 (`js/` 루트)
- **app.js**: DOMContentLoaded 시점에 UI 모듈을 초기화하고 정리 함수(cleanup)를 등록합니다. `?mock=1` 파라미터를 읽어 모의 텔레메트리 활성화 여부를 결정합니다.
- **bluetooth.js**: Web Bluetooth 연결 전 과정을 담당합니다. Nordic UART 서비스를 검색하고, 특성 권한을 분석해 TX(쓰기)와 RX(알림) 채널을 자동으로 선택합니다. 수신 패킷을 조립하는 내부 버퍼(`rxBuffer`)와 연결 해제 이벤트 처리 로직을 포함합니다.
- **dialog-polyfill.js**: 브라우저가 `<dialog>`를 지원하지 않을 때 접근 가능한 모달을 제공하도록 백드롭·포커스 트랩·Esc 종료 동작을 구현합니다.
- **state.js**: 간단한 pub/sub 스토어를 구현해 연결 상태, 최신 샘플, 히스토리를 관리합니다. UI 모듈이 상태를 구독해 변경을 반영합니다.
- **mockTelemetry.js**: 실제 장치 없이 UI를 시험할 때 사용합니다. `?mock=1`이면 주기적으로 가짜 샘플을 생성해 상태 스토어에 전달합니다.

### 5.2 UI 모듈 (`js/ui/`)
- **connection-panel.js**: 연결/해제 버튼, 상태 표시, 오류 메시지, 마지막 수신 시간 UI를 관리하며 Bluetooth 동작과 직접 상호작용합니다. 지원 브라우저 안내 버튼이 눌리면 `<dialog id="supported-browsers-dialog">`를 열고, 폴리필을 사용해 포커스 복귀와 백드롭 클릭 닫기 처리를 담당합니다.
- **axis-selector.js**: Strength/X/Y/Z 축 토글 체크박스를 제공하고, 선택된 축을 전역 상태에 반영해 차트에 전달합니다.
- **live-stats.js**: 최신 샘플의 XYZ/Strength 값을 카드 형태로 렌더링합니다. 값이 없을 때는 기본 플레이스홀더를 보여 줍니다.
- **magnet-chart.js**: Chart.js 인스턴스를 초기화해 선택된 축의 히스토리를 라인 차트로 시각화하고, 상태 변화 시 데이터를 갱신합니다.
- **data-log.js**: 최근 샘플 로그 테이블과 CSV 다운로드 버튼을 관리합니다. 다운로드 시 `utils/csv.js`를 사용합니다.
- **banner.js**: Web Bluetooth 미지원 환경 안내 등 상단 배너 메시지를 표시합니다.

### 5.3 유틸리티 (`js/utils/`)
- **parseSample.js**: `"x,y,z,strength"` 문자열을 검증해 `{ timestamp, x, y, z, strength }` 객체로 변환합니다.
- **format.js**: 타임스탬프 포맷팅, 상대 시간 표시, 숫자 포맷 등 UI 표시용 헬퍼를 제공합니다.
- **csv.js**: 샘플 히스토리를 CSV 문자열로 변환하고, 브라우저 다운로드를 트리거할 수 있는 링크를 생성합니다.
- 필요 시 추가 유틸리티 파일을 만들어 UI 모듈이 공통 로직을 공유할 수 있습니다.
