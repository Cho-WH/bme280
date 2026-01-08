# MagnetBit – Web Magnetometer Dashboard
> 이 프로젝트는 자바실험실 (https://javalab.org) 에서 영감을 받았습니다. 

바로 사용 URL: https://cho-wh.github.io/MagnetometerBit/

micro:bit에서 보내는 자기장 값을 실시간으로 보여주는 웹 대시보드입니다. Web Bluetooth 기반이므로 지원하는 모든 브라우저(Chrome, Edge, 삼성브라우저 등)에서 동작하며, HTTPS 환경이 필수입니다.

## 빠른 시작
1. micro:bit에 `firmware/magnetometer.hex`를 복사해 플래시합니다. (필요하면 `firmware/v-mg.js` 소스를 MakeCode에서 빌드)
2. 위 링크를 Chromium 계열 브라우저에서 엽니다. **데스크톱은 Chrome/Edge 최신 버전**, **모바일은 Android Chrome**에서 Web Bluetooth를 지원합니다.
3. 페이지가 열리면 상단의 **디바이스 연결** 버튼을 눌러 주세요. 브라우저가 장치 목록을 표시하면 `BBC micro:bit`를 선택합니다.
4. 연결에 성공하면 마이크로비트에서 자기 센서 보정이 시작됩니다. 마이크로비트를 모든 방향으로 천천히 돌려주며 LED가 모두 채워지도록 하세요. 디바이스 연결 시 micro:bit의 A 또는 B 버튼을 누른 채로 유지하면 보정 과정을 건너뛰고 바로 측정을 시작할 수 있습니다.(최초 연결 시에는 보정을 건너뛰지 않는 것을 권장합니다.)
5. 보정이 끝나면 측정이 시작됩니다. 화면의 카드·차트·로그가 0.1초 마다 자동 갱신되며, 하단 `CSV 다운로드` 버튼으로 기록을 저장할 수 있습니다.
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
- **연결 직후 오류 발생**: 펌웨어가 최신인지, `firmware/magnetometer.hex`를 다시 플래시했는지 확인합니다. 연결이 끊어지면 micro:bit가 자동으로 재부팅되므로 잠시 기다렸다가 다시 시도하세요.
- **데이터가 이상하게 표시됨**: micro:bit를 다시 보정하거나, 주변에 강한 자성이 있는지 확인해 주세요.

## 개발자용 자료
프로젝트 구조, UI/유틸리티 모듈 설명 등 자세한 내용은 `docs/project-overview.md`를 참고하세요.

기타 문의나 개선 제안은 이슈로 남겨 주시면 감사하겠습니다.
