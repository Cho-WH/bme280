// Unlike parseFloat, this rejects trailing text, empty fields, hex and Infinity.
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const validity = (value, [min, max]) => value >= min && value <= max ? 'valid' : 'out-of-range';

export function decode(line, profile) {
  if (typeof line !== 'string') return { type: 'parse-error', reasonCode: 'not-text' };
  const fields = line.split(',').map((part) => part.trim());
  if (fields.length !== profile.fieldCount) return { type: 'parse-error', reasonCode: 'field-count' };
  if (fields.some((field) => !NUMBER.test(field) || !Number.isFinite(Number(field)))) {
    return { type: 'parse-error', reasonCode: 'invalid-number' };
  }
  const [temperatureC, humidityPct, pressureHpa] = fields.map(Number);
  return {
    type: 'reading', temperatureC, pressureHpa, extraChannels: { humidityPct },
    validity: {
      temperatureC: validity(temperatureC, profile.temperatureRange),
      pressureHpa: validity(pressureHpa, profile.pressureRange),
      humidityPct: profile.humiditySupported ? validity(humidityPct, [0, 100]) : 'unsupported',
    },
  };
}
