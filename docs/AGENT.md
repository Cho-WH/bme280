이 레포지토리는 megnetometerbit의 내용을 clone한 것이다. 프로젝트의 목적은 현재 웹앱을 수정하여 BME280 센서를 사용하여 온도, 습도, 기압을 측정하는 웹 애플리케이션을 개발하는 것이다. fireware에는 bme280.js에 수정 펌웨어 초안이 포함되어 있다. 핵심 수정 과제는 다음과 같다

1. x, y, z, strength를 temperature, humidity, pressure를 측정하도록 수정한다.
2. 그래프의 축 스케일을 하나로 고정하지 말고, 각 요소별로 스케일을 다르게 적용한다.