import { store } from '../state.js'
import { formatTimestamp } from '../utils/format.js'

const axisConfig = {
  temperature: {
    label: '온도',
    color: '#f97316',
    unit: '°C',
    scaleId: 'yTemperature',
    position: 'left',
    digits: 2,
  },
  humidity: {
    label: '습도',
    color: '#38bdf8',
    unit: '%',
    scaleId: 'yHumidity',
    position: 'right',
    digits: 1,
  },
  pressure: {
    label: '기압',
    color: '#22c55e',
    unit: 'hPa',
    scaleId: 'yPressure',
    position: 'right',
    digits: 1,
  },
}

const HISTORY_WINDOW = 120

export const initMagnetChart = () => {
  const root = document.querySelector('[data-component="magnet-chart"]')
  if (!root) return

  const canvas = root.querySelector('canvas')
  const emptyEl = root.querySelector('[data-bind="empty"]')
  const axesEl = root.querySelector('[data-bind="axes"]')

  if (!canvas) return

  const Chart = window.Chart
  if (!Chart) {
    if (emptyEl) {
      emptyEl.textContent = 'Chart.js 로드를 실패했습니다.'
      emptyEl.style.display = 'flex'
    }
    return
  }

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return
  }

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: {
            color: '#94a3b8',
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6,
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.1)',
          },
        },
        yTemperature: {
          display: false,
          position: 'left',
          ticks: {
            color: '#94a3b8',
          },
          grid: {
            color: 'rgba(148, 163, 184, 0.1)',
          },
        },
        yHumidity: {
          display: false,
          position: 'right',
          ticks: {
            color: '#94a3b8',
          },
          grid: {
            drawOnChartArea: false,
            color: 'rgba(148, 163, 184, 0.1)',
          },
        },
        yPressure: {
          display: false,
          position: 'right',
          ticks: {
            color: '#94a3b8',
          },
          grid: {
            drawOnChartArea: false,
            color: 'rgba(148, 163, 184, 0.1)',
          },
        },
      },
      plugins: {
        legend: {
          labels: {
            color: '#e2e8f0',
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              const value = context.parsed.y
              if (typeof value !== 'number') {
                return `${context.dataset.label}`
              }
              return `${context.dataset.label}: ${value.toFixed(2)}`
            },
          },
        },
      },
    },
  })

  let hasRenderedError = false

  const render = (state) => {
    try {
      const samples = state.history.slice(-HISTORY_WINDOW)
      const hasData = samples.length > 0

      if (axesEl) {
        const axesLabel = state.selectedAxes.map((axis) => axisConfig[axis]?.label ?? axis).join(', ')
        axesEl.textContent = `표시 항목: ${axesLabel || '—'}`
      }

      if (!hasData) {
        chart.data.labels = []
        chart.data.datasets = []
        chart.update('none')
        if (emptyEl) {
          emptyEl.hidden = false
        }
        return
      }

      const labels = samples.map((sample) => formatTimestamp(sample.timestamp))
      const datasets = state.selectedAxes.map((axis) => {
        const config = axisConfig[axis]
        const unit = config?.unit ? ` (${config.unit})` : ''
        return {
          label: `${config?.label ?? axis}${unit}`,
          data: samples.map((sample) => sample[axis]),
          borderColor: config?.color ?? '#38bdf8',
          backgroundColor: `${config?.color ?? '#38bdf8'}33`,
          yAxisID: config?.scaleId ?? 'yTemperature',
          tension: 0.25,
          fill: false,
          pointRadius: 0,
          borderWidth: 2,
        }
      })

      chart.data.labels = labels
      chart.data.datasets = datasets

      // Keep scale visibility in sync without mutating nested option objects (Chart.js resolver recursion guard).
      const activeAxes = new Set(state.selectedAxes)
      if (chart.options?.scales) {
        if (chart.options.scales.yTemperature) chart.options.scales.yTemperature.display = activeAxes.has('temperature')
        if (chart.options.scales.yHumidity) chart.options.scales.yHumidity.display = activeAxes.has('humidity')
        if (chart.options.scales.yPressure) chart.options.scales.yPressure.display = activeAxes.has('pressure')
      }
      chart.update('none')

      if (emptyEl) {
        emptyEl.hidden = true
      }
    } catch (error) {
      console.error('Chart render failed', error)
      if (!hasRenderedError && emptyEl) {
        const message = error instanceof Error ? error.message : String(error)
        emptyEl.textContent = `차트 렌더링 오류: ${message}`
        emptyEl.hidden = false
        hasRenderedError = true
      }
    }
  }

  const unsubscribe = store.subscribe(render)

  return () => {
    unsubscribe?.()
    chart.destroy()
  }
}
