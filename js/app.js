import { initConnectionPanel } from './ui/connection-panel.js'
import { initAxisSelector } from './ui/axis-selector.js'
import { initLiveStats } from './ui/live-stats.js'
import { initMagnetChart } from './ui/magnet-chart.js'
import { initDataLog } from './ui/data-log.js'
import { initBanner } from './ui/banner.js'
import { initMockTelemetry } from './mockTelemetry.js'
import { initUsageGuide } from './ui/usage-guide.js'

const cleanupTasks = []
const registerCleanup = (fn) => {
  if (typeof fn === 'function') {
    cleanupTasks.push(fn)
  }
}

const boot = () => {
  const params = new URLSearchParams(window.location.search)
  const mockEnabled = ['1', 'true', 'yes'].includes((params.get('mock') || '').toLowerCase())

  initBanner({ mockEnabled })

  registerCleanup(initUsageGuide())

  registerCleanup(initConnectionPanel())
  registerCleanup(initAxisSelector())
  registerCleanup(initLiveStats())
  registerCleanup(initMagnetChart())
  registerCleanup(initDataLog())

  let disposeMock
  if (mockEnabled) {
    disposeMock = initMockTelemetry()
    registerCleanup(disposeMock)
  }

  window.addEventListener('beforeunload', () => {
    cleanupTasks.splice(0).forEach((fn) => {
      try {
        fn()
      } catch (error) {
        console.warn('Cleanup failed', error)
      }
    })
  })
}

document.addEventListener('DOMContentLoaded', boot)
