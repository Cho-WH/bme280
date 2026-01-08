const CSV_HEADER = 'timestamp,temperature_c,humidity_pct,pressure_hpa'

export const buildCsv = (samples) => {
  if (!Array.isArray(samples)) return CSV_HEADER
  const rows = samples.map((sample) =>
    [
      new Date(sample.timestamp).toISOString(),
      sample.temperature,
      sample.humidity,
      sample.pressure,
    ].join(',')
  )
  return [CSV_HEADER, ...rows].join('\n')
}

export const downloadCsv = (samples, filename = 'bme280-log.csv') => {
  if (!Array.isArray(samples) || samples.length === 0) {
    return
  }

  const csvContent = buildCsv(samples)
  const blob = new Blob(['\ufeff', csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  URL.revokeObjectURL(url)
}
