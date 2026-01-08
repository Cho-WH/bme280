# BME280 Web Dashboard Migration Plan

## Background
This repository is cloned from the “MagnetBit/MagnetometerBit” web dashboard project. The goal of the current work is to adapt the existing Web Bluetooth + Chart.js dashboard to visualize environmental readings from a BME280 sensor (temperature, humidity, pressure) instead of magnetometer readings (x, y, z, strength).

The requirements from `docs/AGENT.md` are:
1. Replace `x, y, z, strength` with `temperature, humidity, pressure`.
2. Do not force a single fixed Y-axis scale for all series; apply separate scales per metric.

## Current Project Structure (as-is)
- `index.html`: Single-page UI (sidebar controls, live cards, chart, log table, dialogs).
- `styles.css`: Styling for the dashboard.
- `vendor/chart.umd.js`: Chart.js bundle.
- `js/`
  - `app.js`: Bootstraps UI modules and optional mock mode (`?mock=1`).
  - `bluetooth.js`: Web Bluetooth (Nordic UART) connection, RX buffering by newline.
  - `state.js`: Global store (`latestSample`, `history`, `selectedAxes`, connection status).
  - `mockTelemetry.js`: Generates mock magnetometer samples for UI testing.
  - `ui/`
    - `connection-panel.js`: Connect/disconnect flow; starts notifications; currently sends `magnet\n`.
    - `axis-selector.js`: Checkbox toggles for `strength/x/y/z`.
    - `live-stats.js`: Renders latest values for `strength/x/y/z`.
    - `magnet-chart.js`: Chart.js line chart; currently a single shared `y` scale.
    - `data-log.js`: Recent table + CSV download.
    - `banner.js`, `usage-guide.js`: UI helpers for banners and dialogs.
  - `utils/`
    - `parseSample.js`: Parses `"x,y,z,strength"` into a sample object.
    - `format.js`: Number/time formatting.
    - `csv.js`: Builds and downloads CSV (`timestamp,x,y,z,strength`).
- `firmware/`
  - `v1.1-mg.js`, `magnetometer.hex`: Original magnetometer firmware (reference).
  - `bme280.js`, `bme_1.0.hex`: Draft BME280 firmware and a built HEX.
- `docs/`
  - `AGENT.md`: Task definition for this migration.
  - `project-overview.md`: Documentation of the original magnetometer project.

## Target Data Contract (Telemetry)
Define a stable, newline-delimited CSV line format that both firmware and web agree on.

Recommended contract:
- Line format: `temperature_c,humidity_pct,pressure_hpa\n`
  - `temperature_c`: float (e.g., `23.45`)
  - `humidity_pct`: float (e.g., `56.70`)
  - `pressure_hpa`: float (e.g., `1008.23`)
- Parsing rules:
  - Trim whitespace, allow `\r\n`, reject malformed lines (wrong field count / non-numeric).
  - Store samples as `{ timestamp, temperature, humidity, pressure }`.

Command/handshake:
- Update the start command from `magnet\n` to `bme\n`.
  - Compatibility check: verify the web app can still connect to devices running legacy magnet firmware (expects `magnet\n`). If legacy support is required, implement a dual-command strategy:
    - Preferred: web sends `bme\n`, and if no valid BME280 samples are parsed within a short timeout, fall back to sending `magnet\n` (or expose a UI toggle/URL param).
    - Alternative: firmware accepts both commands (`bme` and `magnet`) and treats them as “start streaming”.
  - Update both sides consistently:
    - Firmware: UART command string check.
    - Web: rename `sendMagnetCommand` (and call site in `js/ui/connection-panel.js`) to a BME280-specific command sender.

## Implementation Plan (Concrete Work Items)

### 1) Firmware: Emit BME280 Telemetry
Files:
- `firmware/bme280.js`
- (optional) `firmware/bme_*.hex` (regenerate after changes)

Tasks:
- Fix the currently duplicated temperature value:
  - Current firmware line effectively includes temperature twice (first field and last field).
  - Delete the **first** temperature field (the old “x” position) and keep the **last** temperature field (the old “strength” position) as the canonical temperature.
- After removing the duplicate, emit exactly **three** values per line in this order:
  - `temperature_c,humidity_pct,pressure_hpa`
- Confirm the firmware’s BME280 API returns the expected units (convert Pa → hPa if needed).
- Keep the sampling cadence reasonable for BME280 (e.g., 500–1000 ms) unless high-rate sampling is required.

Acceptance:
- When connected and streaming, each UART line matches the contract and is stable over time.

### 2) Parsing + State: Rename Data Fields
Files:
- `js/utils/parseSample.js`
- `js/state.js`

Tasks:
- Replace 4-field parsing with 3-field parsing.
- Return the new sample shape:
  - `{ timestamp: Date.now(), temperature, humidity, pressure }`
- Update defaults:
  - `INITIAL_SELECTED_AXES` to a sensible default (e.g., `['temperature']`).
  - Rename any “axes” terminology if desired (still OK to keep “axes” as “metrics”).

Acceptance:
- Incoming telemetry updates `latestSample`/`history` without errors.

### 3) UI: Replace Magnetometer Labels/Units with BME280 Metrics
Files:
- `index.html`
- `js/ui/axis-selector.js`
- `js/ui/live-stats.js`
- `js/ui/data-log.js`

Tasks:
- Update axis selector options:
  - Replace `strength/x/y/z` with `temperature/humidity/pressure`.
- Update live stat cards:
  - Labels: Temperature / Humidity / Pressure
  - Units: `°C`, `%`, `hPa` (or chosen units)
  - Digits: temperature (1–2), humidity (1), pressure (1–2) depending on noise level.
- Update the log table:
  - Columns: timestamp + the three metrics
  - Adjust empty-state colspan.
- Update user-facing copy (titles, subtitles, helper text, usage guide content) to reflect BME280 instead of magnetometer calibration.

Acceptance:
- UI renders correctly with both mock data and real device data.

### 4) Chart: Per-Metric Y-Axis Scaling (Core Requirement #2)
Files:
- `js/ui/magnet-chart.js` (can be renamed later; keep minimal scope for now)

Tasks:
- Replace the single shared `y` scale with three independent Y scales, one per metric:
  - Example scale IDs: `yTemperature`, `yHumidity`, `yPressure`
  - Each dataset sets `yAxisID` to its metric scale.
- Make scales conditional:
  - Hide a scale when its metric is not selected.
- Improve readability:
  - Distinct colors per metric (keep existing color pattern).
  - Tooltip shows value + correct unit per metric.
  - Optional: add small padding (suggestedMin/Max) based on visible data range per metric.

Acceptance:
- When multiple metrics are enabled, each uses its own Y-axis scale (no “flattening” due to mismatched ranges).

### 5) CSV Export: Update Columns and Filename
Files:
- `js/utils/csv.js`

Tasks:
- Update header to: `timestamp,temperature_c,humidity_pct,pressure_hpa` (or chosen naming).
- Update row generation to output the new fields.
- Update default filename to something like `bme280-log.csv`.

Acceptance:
- CSV downloads successfully and opens with correct columns/values.

### 6) Mock Mode: Generate Realistic BME280 Samples
Files:
- `js/mockTelemetry.js`

Tasks:
- Replace magnetometer mock with plausible environmental values (slow drift + small noise).
  - Temperature: ~18–30 °C
  - Humidity: ~30–80 %
  - Pressure: ~980–1030 hPa

Acceptance:
- `?mock=1` produces realistic-looking charts and logs for UI development.

### 7) Documentation Updates (Optional but Recommended)
Files:
- `README.md`
- `docs/project-overview.md`

Tasks:
- Rename the project and update descriptions to BME280.
- Update “firmware download” references in the usage dialog and README (if distributing a HEX).
- Document the telemetry line contract and units.

Acceptance:
- A new developer can flash firmware, open the page, and understand the data format.

Status:
- Deferred: treat documentation updates as a follow-up task after the end-to-end data path (firmware → web) is confirmed stable.

## Validation Checklist (Manual)
- Open `index.html` via `http://localhost` (or HTTPS) and verify:
  - `?mock=1` renders Temperature/Humidity/Pressure everywhere (cards, chart, log, CSV).
- Connect a micro:bit and verify:
  - Streaming starts after the start command is sent.
  - No parse errors (no gaps in updates unless the device stops sending).
  - Chart shows separate Y scales when multiple metrics are enabled.
- Download CSV and confirm columns + units match expectations.

## Definition of Done
- The dashboard no longer references `x/y/z/strength` in data flow or UI.
- Telemetry contract is implemented end-to-end (firmware → BLE UART → parser → state → UI/CSV).
- Chart uses per-metric scaling and remains readable with any combination of selected metrics.
