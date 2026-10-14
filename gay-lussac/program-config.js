// Verified communication covers USB install, BLE readings and battery operation, not sensor accuracy.
export const PROGRAM = Object.freeze({
  url: '../firmware/bme_1.2.hex',
  fileName: 'bme_1.2.hex',
  version: 'bme 1.2',
  // SHA-256 of UTF-8 HEX text with CRLF normalized to LF (all other content retained).
  sha256: '481d3136ae9db5747066be9ef7f21604cb060799ab62ed3206bc9e78e1fb55ea',
  verification: 'communication-verified',
  profile: Object.freeze({
    id: 'bmp280-csv-v1', fieldCount: 3,
    temperatureRange: Object.freeze([-40, 85]), pressureRange: Object.freeze([300, 1100]),
    humiditySupported: false,
  }),
});

export const CONNECTION = Object.freeze({
  firstReadingTimeoutMs: 3000, retryIntervalMs: 300, retryLimit: 5,
  staleMs: 5000, confirmationCount: 3, confirmationSpanMs: 1000,
});
