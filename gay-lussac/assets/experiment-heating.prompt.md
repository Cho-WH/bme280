# 실험 방법 2단계 그림

- 파일: `experiment-heating.png`
- 제작: 내장 `image_gen` 편집 도구, 2026-10-14
- 참조: 기존 `setup.svg`의 병 형태와 마이크로비트·배터리·센서 배치.
- 용도: 밀폐 용기 옆 수조에 물을 붓는 정지 그림. 가열 시작 표시는 버튼 모양의 그림이며 조작 요소가 아니다.
- 표현: 마이크로비트와 배터리는 바닥에, BMP280 센서는 중간 높이에 배치한다. 배선은 모두 용기 내부에 두고 물은 외부에만 표시한다. 부품을 알아볼 수 있도록 단순화한 개념도다.

## 최종 편집 프롬프트

Use case: precise-object-edit.
Edit target: Image 1, the current heating-guide illustration.
Equipment layout reference: Image 2, the project's container setup diagram.

Change ONLY the equipment inside the sealed jar of Image 1. Replace the two anonymous gray/tan blocks with recognizable simplified micro:bit experiment equipment, faithfully following the arrangement of Image 2. Keep the rest of Image 1 unchanged: the jar silhouette and lid, tan gasket, clasps, external supports, water bath, kettle, pouring stream, white background, palette, framing, and the separate button drawing with exact Korean text "가열 시작".

Inside the jar:
- At the bottom left, a small horizontal dark blue-gray micro:bit board seated on a pale expansion-board base. Its identifying features should be legible: a compact red-orange 5-by-5 LED dot matrix near the center, two small round pale buttons at either side, and five golden round edge contacts along the bottom. A clean front view, not a generic blank rectangle. Larger than the existing anonymous gray block, but with space around it.
- At the bottom right, a dark battery holder showing two upright warm tan battery cells side by side. Show only simple tiny plus/minus marks, no text labels.
- At the middle of the dry air space above the micro:bit, a small teal BMP280 breakout board with a pale central sensor chip and four tiny gold contacts along its lower edge, as in Image 2. It stays clear of the jar walls, lid, bottom, and other components.
- Connect the sensor to the micro:bit with four thin gently curved colored wires, and the battery holder to the board with two short restrained red/dark wires. Every wire remains INSIDE the sealed jar. No hanging wire from the lid, no external cable, no USB cable through the glass.
Use clear flat silhouettes, restrained solid colors and thin rounded outlines matching the setup reference. The devices should look like the actual educational kit, simplified enough to read when the whole image is shown at 350 pixels wide. Do not add detailed circuit traces or extra unexplained equipment.

The jar interior stays opaque pale off-white, completely DRY: no blue waterline or blue water fill inside. Bath water remains only outside the jar.
Do not copy any labels, arrows, Bluetooth waves or typography from Image 2. No new text, captions or decorations. Keep the overall scene simple. Preserve "가열 시작" verbatim. Output a square illustration.

