# 실험 방법 그림 제작 기록

- 제작: 내장 `image_gen` 도구, 2026-10-14.
- 공통 참조: 승인된 [2단계 그림](experiment-heating.png)의 색감·선·용기와 장비 형태. [2단계 제작 프롬프트](experiment-heating.prompt.md).
- 모든 버튼·스위치·손잡이는 그림에 포함된 설명용 표시이며 조작 요소가 아니다.
- 문구는 본문의 안내를 따르고, 그림에 실험 수치나 정답을 추가하지 않는다.
- 실제 버튼 디자인 참조: `../styles.css`의 기본 버튼과 `.event-note-edit`.

| 단계 | 적용 파일 | 내용 |
| --- | --- | --- |
| 1 · 처음 값 | [experiment-preparation.png](experiment-preparation.png) | 고정된 밀폐 용기·센서·수조와 옆에 준비한 포트 |
| 2 · 데우기 | [experiment-heating.png](experiment-heating.png) | 용기 밖 수조에 물 붓기와 가열 시작 표시 |
| 3 · 변화 기록 | [experiment-recording.png](experiment-recording.png) | 시간 그래프·물 추가·장치 변화·메모 추가 |
| 4 · 자료 살피기 | [experiment-analysis.png](experiment-analysis.png) | 구간 선택·촘촘한 산점도·x절편까지 추세선 연장 |

## 1단계 · 준비 상태

### 생성 프롬프트

Create one square companion illustration for a Korean school experiment guide, matching the supplied reference's clean, calm illustrated style. Reference Image 1 is the approved heating illustration and is the visual style anchor. Match its muted blue-gray rounded outlines, restrained teal, pale blue and warm ochre accents, off-white surfaces, pure white background, generous breathing space, and simple front-facing diagram language. Readable at 350px wide. No decorative background blobs, page numbers, watermarks, heavy shadows, photorealism, dense text, explanatory arrows or extraneous objects. This is a flat static illustration, never live interactive controls. All Korean labels specified below must be exact and large enough to read. Keep shapes crisp and uncluttered.
Use case: scientific-educational.
Primary request: Turn the reference scene into the BEFORE-heating preparation scene.
Show the same sealed glass jar, clasp lid, thin tan gasket, gray side clasps, straight sides, softly curved shoulders, and rounded base, sitting upright secured by the same minimal external support inside the same pale-blue water bath. Bath water reaches around the lower half of the jar. Jar interior is dry off-white, with no blue water visible inside. Copy the recognizable simplified kit from the approved reference: micro:bit board on expansion base at bottom left, dark two-cell battery holder at bottom right, small teal BMP280 sensor floating in the middle of the dry air space above, fine curved connecting wires entirely inside the jar. Do not turn the equipment into anonymous blocks. No wire crosses the sealed lid.
Place the same simple electric kettle UPRIGHT beside the bath on the right, ready for later use, clearly outside the water bath and not tilted. Its spout points left, with two small restrained steam wisps indicating hot water inside. There is NO pouring stream. The jar is the focus, with the kettle secondary and somewhat smaller. Keep sensible spacing and scale; all objects fully in frame. Remove the "가열 시작" button from this preparation image. No buttons, letters, numbers, captions or labels anywhere. Do not add thermometers, hands, people, taps or extra devices. Water bath, closed jar, internal kit and ready kettle are all that is needed.

## 3단계 · 변화 기록

### 생성 프롬프트

Create one square companion illustration for a Korean school experiment guide, matching the supplied reference's clean, calm illustrated style. Reference Image 1 is the approved heating illustration and is the visual style anchor. Match its muted blue-gray rounded outlines, restrained teal, pale blue and warm ochre accents, off-white surfaces, pure white background, generous breathing space, and simple front-facing diagram language. Readable at 350px wide. No decorative background blobs, page numbers, watermarks, heavy shadows, photorealism, dense text, explanatory arrows or extraneous objects. This is a flat static illustration, never live interactive controls. All Korean labels specified below must be exact and large enough to read. Keep shapes crisp and uncluttered.
Use case: ui-mockup.
Primary request: Illustrate a highly simplified measurement screen with a time graph and event-recording button drawings. Do NOT draw the jar or kettle from the reference; borrow only the visual style.
Composition: a single front-facing off-white rounded measurement panel occupying the central 80% of the square canvas, with generous white margins. Fine blue-gray outline, no browser chrome or laptop hardware. The upper two thirds show one broad time graph, two simple softly irregular gradually rising lines: warm muted ochre for temperature and teal for pressure. A very faint three-line grid, small ochre legend dot and exact label "온도", teal dot and exact label "압력" above the graph, exact label "시간" below the horizontal axis. No numerical ticks, no formulas. These are time-series curves, not a regression scatterplot.
Under the graph, draw two equal compact rounded buttons side by side: a small simple water-droplet icon plus exact text "물 추가", and a small simple wrench icon plus exact text "장치 변화". The water-addition button uses pale blue fill and teal outline; the device-change button has pale off-white fill and a blue-gray outline. Both are illustrations only. No cursor, hand, arrow, leader or line connects buttons to the graph.
At the bottom of the panel, use just one minimal event row: small clock icon, exact text "물 추가", and a small outlined pencil button with exact text "메모 추가" at the right. Separate this row from the buttons by a thin pale divider, not a heavy nested card. Do not invent extra readings, instructional paragraphs, headings or controls. Clear comfortable spacing. Only text: "온도", "압력", "시간", "물 추가" (button and row), "장치 변화", "메모 추가".

### 적용된 최종 편집 프롬프트

Use case: precise-object-edit.
Edit target: the supplied measurement-and-recording illustration.
Change ONLY the three BUTTON drawings and their typography to faithfully match the real experiment app. Keep the graph, panel frame, legend, time axis, bottom event row's clock and "물 추가" text, composition, margins and muted palette unchanged.

The actual app uses simple quiet text buttons, WITHOUT icons:
- Main action button exact text "물 추가": remove the giant water-droplet icon and remove cyan fill, bright teal outline and thick border. White fill #ffffff, thin 1-unit border #bccfce, rounded rectangle with corner radius 8 units for height 44 units. Text #213d47, Korean system sans, weight 600, centered. No gradient, glow or shadow.
- Adjacent main action exact text "장치 변화": remove the wrench icon and thick dark outline. Use exactly the same white fill, thin pale gray-green border, corner rounding, label styling and button size as "물 추가".
- Bottom row button exact text "메모 추가": remove pencil icon. Use the same quiet white and thin pale border styling, but as a compact text-only button slightly smaller than the two main action buttons. Align at right of the existing event row.

The TWO main buttons should be modest horizontal text buttons with comfortable margins, rather than oversized decorative icon cards. At this 1254px image resolution, a scale around 3x the app's CSS dimensions is suitable: height roughly 100–115 px, corner radius roughly 18–21 px, border about 2.5 px, font 38–42 px. Reduce their current oversized height and keep them centered in their existing row; do not enlarge other elements to consume the reclaimed white space. Preserve the original labels verbatim, with no new labels. The lower compact button uses proportionally lighter typography.
No cursor, hand or connector arrows. These remain static button illustrations, not actual clickable UI. Do NOT change the temperature and pressure curves, legend, axes or clock icon. Same square output.

## 4단계 · 자료 살피기

### 생성 프롬프트

Create one square companion illustration for a Korean school experiment guide, matching the supplied reference's clean, calm illustrated style. Reference Image 1 is the approved heating illustration and is the visual style anchor. Match its muted blue-gray rounded outlines, restrained teal, pale blue and warm ochre accents, off-white surfaces, pure white background, generous breathing space, and simple front-facing diagram language. Readable at 350px wide. No decorative background blobs, page numbers, watermarks, heavy shadows, photorealism, dense text, explanatory arrows or extraneous objects. This is a flat static illustration, never live interactive controls. All Korean labels specified below must be exact and large enough to read. Keep shapes crisp and uncluttered.
Use case: scientific-educational.
Primary request: A simple educational analysis-screen illustration showing time-range selection and a temperature–pressure trend line extended to its x-intercept. Do NOT draw a kettle or jar; borrow only the visual style.
Composition: one clean off-white front-facing rounded analysis panel occupying central 85% of a square white canvas.
At the TOP, a compact timeline strip shows a single teal rising wavy time-series curve. Overlay a pale translucent teal selected interval across the middle 55% with two obvious slim vertical teal edge handles and slightly faded data outside the range. Above or beside this strip use only the exact small label "구간 선택". This is a separate timeline strip, not a brush on the scatterplot. No numeric labels.
BELOW, the main large plot uses horizontal TEMPERATURE axis and vertical PRESSURE axis, exact small labels "온도" at the right end of the horizontal axis and "압력" at the top of the vertical axis. Scientifically coherent layout: horizontal axis spans the panel from left to right near the bottom; vertical axis crosses it around 40% of its width so negative temperatures are visible to the left. The horizontal axis is zero pressure. A positive-slope straight trend line crosses the horizontal axis in its left third, LEFT of the vertical axis, then rises smoothly to the upper-right. Put a small cluster of 7 to 10 teal measured dots only in the upper-right area around the line, with slight scatter. No measured dots along the extended part. The measured-region line is solid teal and the extension toward the x-axis is thin muted dashed teal. The extension ends exactly ON the horizontal axis (never below it). A small pale ochre halo ring at that exact x-intercept attracts subtle attention; no crosshair, sparkle, arrows, big glow or numerical result. Do NOT show -273, -273.15, zero, or any other number or predetermined conclusion.
Below the plot, draw two neat little enabled toggle illustrations side by side, each with a centered round thumb on the right and exact adjacent labels "추세선" and "추세선 연장". They are static illustrations, not real controls. No additional buttons, table, formulas, statistics, headings or annotations. Only text: "구간 선택", "온도", "압력", "추세선", "추세선 연장".

### 적용된 최종 편집 프롬프트

Use case: precise-object-edit.
Edit target: the supplied analysis-guide illustration.
Change ONLY the large isolated scatter dots in the upper-right measured region to dense realistic data. Replace them with around 150–250 tiny closely spaced teal dots, diameter about 3–4 pixels at this image resolution, spacing roughly 1–2 pixels, and only tiny perpendicular variation. The points almost overlap in a narrow gently uneven upward band along the trend line, appearing like a nearly continuous fine measured line at 350px thumbnail size. No large outliers, large bubbles, wide gaps or broad scattered cloud. All measured data remains within the upper-right measured segment; do not scatter points across the extrapolated line.
Keep the thin straight fitted line and its dashed extrapolation reaching the highlighted x-intercept on the horizontal axis. No data dots on the extrapolation.
PRESERVE EVERYTHING ELSE EXACTLY, especially BOTH bottom toggle switches with their original shape, size, colors, Korean labels and arrangement. Also preserve the top range handles, timeline, frame, axis layout and labels, x-intercept halo and white background. Do not redesign any button or control. No new text or values. Same square output.

