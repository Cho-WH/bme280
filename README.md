# BME280 – Web Environmental Dashboard
> 이 프로젝트는 자바실험실 (https://javalab.org) 에서 영감을 받았습니다.

바로 사용 URL: https://cho-wh.github.io/bme280/

micro:bit에서 보내는 BME280(온도/습도/기압) 값을 Web Bluetooth(Nordic UART)로 받아 실시간으로 시각화하고 CSV로 저장하는 웹 대시보드입니다. HTTPS(또는 http://localhost) 환경이 필요합니다.

## 빠른 시작
1. micro:bit에 `firmware/bme_1.0.hex`를 복사해 플래시합니다. (또는 `firmware/bme280.js`를 MakeCode에서 빌드)
2. 위 링크를 Chromium 계열 브라우저에서 엽니다. **데스크톱은 Chrome/Edge 최신 버전**, **모바일은 Android Chrome/삼성 브라우저**에서 Web Bluetooth를 지원합니다.
3. 페이지가 열리면 상단의 **디바이스 연결** 버튼을 눌러 주세요. 브라우저가 장치 목록을 표시하면 `BBC micro:bit`를 선택합니다.
4. 연결에 성공하면 micro:bit가 `bme` 스트리밍을 시작하고 화면의 카드·차트·로그가 자동 갱신됩니다.
5. 하단 `CSV 다운로드` 버튼으로 기록을 저장할 수 있습니다.
6. micro:bit가 준비되지 않았다면 주소 끝에 `?mock=1`을 붙여 접속하세요. 가상의 데이터가 제공되어 사용 테스트를 해볼 수 있습니다.

> Web Bluetooth 특성상 페이지는 반드시 `https://` 또는 `http://localhost`에서 열어야 합니다. GitHub Pages는 자동으로 HTTPS를 제공하므로 별도 설정이 필요 없습니다.

### 모바일 지원 안내
- Android에서는 Chrome/삼성브라우저 등의 최신 버전에서 연결이 가능합니다.
- iOS에서는 브라우저의 기반이 되는 Safari가 Web Bluetooth를 지원하지 않기에 작동이 불가능합니다. 'Bluefy – Web BLE Browser'이라는 앱을 이용해주세요.
- 모바일에서 micro:bit를 선택할 때는 블루투스 권한·위치 권한을 허용해 주세요. 허용하지 않으면 장치를 찾지 못합니다.
- 화면이 작을 때는 차트가 자동으로 축소되며, 스크롤로 다른 카드와 로그를 확인할 수 있습니다.

## 지원 브라우저
- Chrome / Edge (데스크톱, Android)
- 브라우저 보안 정책에 따라 다른 탭이나 iframe에서 열면 동작하지 않을 수 있습니다.

## 문제 해결
- **디바이스가 목록에 보이지 않음**: micro:bit 전원이 켜져 있는지, 다른 장치에 이미 연결돼 있지 않은지 확인하고 다시 스캔하세요.
- **연결은 되는데 값이 표시되지 않음**: micro:bit에 `firmware/bme_1.0.hex`가 플래시되어 있는지 확인하세요. (자기장 펌웨어는 데이터 포맷이 달라 웹앱에서 파싱되지 않습니다.)
- **연결 직후 오류 발생**: 펌웨어를 다시 플래시하고 micro:bit가 재부팅될 시간을 준 뒤 재시도하세요.
- **값이 비정상적/고정됨**: BME280 배선(I2C) 및 센서 전원/주소 설정을 확인하세요.

## 개발자용 자료
프로젝트 구조, UI/유틸리티 모듈 설명 등 자세한 내용은 `docs/project-overview.md`를 참고하세요.

기타 문의나 개선 제안은 이슈로 남겨 주시면 감사하겠습니다.
