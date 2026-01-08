const isFiniteNumber = (value) => Number.isFinite(value)

export const parseSample = (raw) => {
  if (typeof raw !== 'string') {
    return null
  }

  const segments = raw.split(',').map((part) => part.trim())
  if (segments.length !== 3) {
    return null
  }

  const [temperatureStr, humidityStr, pressureStr] = segments
  const temperature = Number.parseFloat(temperatureStr)
  const humidity = Number.parseFloat(humidityStr)
  const pressure = Number.parseFloat(pressureStr)

  if (![temperature, humidity, pressure].every(isFiniteNumber)) {
    return null
  }

  return {
    timestamp: Date.now(),
    temperature,
    humidity,
    pressure,
  }
}
