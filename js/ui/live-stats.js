import { store } from '../state.js'
import { formatNumber } from '../utils/format.js'

const metrics = [
  { key: 'temperature', digits: 1 },
  { key: 'humidity', digits: 1 },
  { key: 'pressure', digits: 1 },
]

export const initLiveStats = () => {
  const root = document.querySelector('[data-component="live-stats"]')
  if (!root) return

  const cards = new Map()
  metrics.forEach(({ key }) => {
    const card = root.querySelector(`[data-field="${key}"]`)
    if (!card) return
    const valueEl = card.querySelector('[data-role="value"]')
    cards.set(key, valueEl)
  })

  const render = (state) => {
    metrics.forEach(({ key, digits }) => {
      const valueEl = cards.get(key)
      if (!valueEl) return
      const value = state.latestSample ? state.latestSample[key] : undefined
      valueEl.textContent = formatNumber(value, digits)
    })
  }

  const unsubscribe = store.subscribe(render)
  return () => unsubscribe?.()
}
