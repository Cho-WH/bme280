export const formatTimestamp = (timestamp) => {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleTimeString()
}

export const formatNumber = (value, digits = 2) => {
  if (value === undefined || Number.isNaN(value)) {
    return '—'
  }
  return Number(value).toFixed(digits)
}

export const formatRelative = (timestamp) => {
  if (!timestamp) return '—'
  const delta = Date.now() - timestamp
  if (delta < 0) return '방금'

  const seconds = Math.floor(delta / 1000)
  if (seconds < 1) return '방금'
  if (seconds < 60) return `${seconds}s 전`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m 전`
  const hours = Math.floor(minutes / 60)
  return `${hours}h 전`
}
