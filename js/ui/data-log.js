import { store, actions } from '../state.js'
import { formatNumber, formatTimestamp } from '../utils/format.js'
import { downloadCsv } from '../utils/csv.js'

const ROW_LIMIT = 12

export const initDataLog = () => {
  const root = document.querySelector('[data-component="data-log"]')
  if (!root) return

  const button = root.querySelector('[data-action="download"]')
  const clearButton = root.querySelector('[data-action="clear"]')
  const tbody = root.querySelector('[data-bind="rows"]')
  const countEl = root.querySelector('[data-bind="count"]')

  const render = (state) => {
    const history = state.history ?? []
    const hasData = history.length > 0
    if (button) {
      button.disabled = !hasData
    }
    if (clearButton) {
      clearButton.disabled = !hasData
    }

    if (countEl) {
      countEl.textContent = `총 ${history.length.toLocaleString()}건`
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

  if (clearButton) {
    clearButton.addEventListener('click', () => {
      const state = store.getState()
      if (!Array.isArray(state.history) || state.history.length === 0) {
        return
      }
      const ok = window.confirm('누적 기록을 초기화할까요? 이 작업은 되돌릴 수 없습니다.')
      if (!ok) return
      store.dispatch(actions.clearHistory())
    })
  }

  const unsubscribe = store.subscribe(render)
  return () => unsubscribe?.()
}
