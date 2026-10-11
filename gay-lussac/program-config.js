// Verified communication covers USB install, BLE readings and battery operation, not sensor accuracy.
export const PROGRAM = Object.freeze({
  url: '../firmware/bme_1.2.hex',
  fileName: 'bme_1.2.hex',
  version: 'bme 1.2',
  sha256: '435fb8f8d160da517f3924d34cb22294a5d9e3c2aadca6bb4f5b305346e97186',
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
