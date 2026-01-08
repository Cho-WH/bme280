import { store } from '../state.js'
import { formatNumber, formatTimestamp } from '../utils/format.js'
import { downloadCsv } from '../utils/csv.js'

const ROW_LIMIT = 12

export const initDataLog = () => {
  const root = document.querySelector('[data-component="data-log"]')
  if (!root) return

  const button = root.querySelector('[data-action="download"]')
  const tbody = root.querySelector('[data-bind="rows"]')

  const render = (state) => {
    const history = state.history ?? []
    const hasData = history.length > 0
    if (button) {
      button.disabled = !hasData
    }

    if (!tbody) return

    if (!hasData) {
      tbody.innerHTML = '<tr><td colspan="4">데이터를 수신하면 로그가 표시됩니다.</td></tr>'
      return
    }

    const recent = history.slice(-ROW_LIMIT).reverse()
    const rows = recent
      .map((sample) => {
        const cells = [
          formatTimestamp(sample.timestamp),
          formatNumber(sample.temperature),
          formatNumber(sample.humidity),
          formatNumber(sample.pressure),
        ]
        const tds = cells.map((value) => `<td>${value}</td>`).join('')
        return `<tr>${tds}</tr>`
      })
      .join('')

    tbody.innerHTML = rows
  }

  if (button) {
    button.addEventListener('click', () => {
      const state = store.getState()
      downloadCsv(state.history)
    })
  }

  const unsubscribe = store.subscribe(render)
  return () => unsubscribe?.()
}
