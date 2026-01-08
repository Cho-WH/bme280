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
              const axisKey = context.dataset.dataKey
              const config = axisConfig[axisKey]
              const digits = config?.digits ?? 2
              const unit = config?.unit ? ` ${config.unit}` : ''
              return `${context.dataset.label}: ${value.toFixed(digits)}${unit}`
            },
          },
        },
      },
    },
  })

  const render = (state) => {
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
      return {
        label: config?.label ?? axis,
        dataKey: axis,
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
    const activeAxes = new Set(state.selectedAxes)
    const primaryAxis = state.selectedAxes[0]
    Object.entries(axisConfig).forEach(([axisKey, config]) => {
      const scale = chart.options.scales?.[config.scaleId]
      if (!scale) return
      const isActive = activeAxes.has(axisKey)
      scale.display = isActive
      scale.position = config.position
      scale.grid = scale.grid || {}
      scale.grid.drawOnChartArea = isActive && primaryAxis === axisKey
    })
    chart.update('none')

    if (emptyEl) {
      emptyEl.hidden = true
    }
  }

  const unsubscribe = store.subscribe(render)

  return () => {
    unsubscribe?.()
    chart.destroy()
  }
}
