import { store, actions } from '../state.js'
import { formatRelative, formatTimestamp } from '../utils/format.js'
import { parseSample } from '../utils/parseSample.js'
import {
  isSupported,
  requestDevice,
  connect as connectDevice,
  startNotifications,
  sendBmeCommand,
  stopNotifications,
  disconnect as disconnectDevice,
  setDisconnectedListener,
} from '../bluetooth.js'

const statusLabelMap = {
  disconnected: '연결 안 됨',
  connecting: '연결 중',
  connected: '연결됨',
}

export const initConnectionPanel = () => {
  const root = document.querySelector('[data-component="connection-panel"]')
  if (!root) return

  const statusEl = root.querySelector('[data-bind="status"]')
  const lastUpdatedEl = root.querySelector('[data-bind="last-updated"]')
  const relativeEl = root.querySelector('[data-bind="relative-time"]')
  const errorEl = root.querySelector('[data-bind="error"]')
  const connectBtn = root.querySelector('[data-action="connect"]')
  const disconnectBtn = root.querySelector('[data-action="disconnect"]')
  const helperEl = root.querySelector('[data-bind="helper"]')
  const supportedButton = root.querySelector('[data-action="show-supported"]')
  const supportedDialogEl = document.getElementById('supported-browsers-dialog')

  if (supportedDialogEl && window.dialogPolyfill && typeof window.dialogPolyfill.registerDialog === 'function') {
    window.dialogPolyfill.registerDialog(supportedDialogEl)
  }

  const supportedDialog =
    supportedDialogEl && typeof supportedDialogEl.showModal === 'function' ? supportedDialogEl : null

  if (supportedButton && supportedDialog) {
    supportedButton.addEventListener('click', () => {
      if (!supportedDialog.open) {
        supportedDialog.showModal()
      }
    })
    supportedDialog.addEventListener('click', (event) => {
      if (event.target === supportedDialog) {
        supportedDialog.close()
      }
    })
    supportedDialog.addEventListener('close', () => {
      supportedButton.focus()
    })
  }

  let isBusy = false
  let manualDisconnect = false
  let lastState = store.getState()

  const setBusy = (busy) => {
    isBusy = busy
    if (connectBtn) connectBtn.disabled = busy || lastState.connectionStatus !== 'disconnected' || !isSupported()
    if (disconnectBtn) disconnectBtn.disabled = busy || lastState.connectionStatus === 'disconnected'
  }

  const updateError = (message) => {
    if (!errorEl) return
    if (!message) {
      errorEl.textContent = ''
      errorEl.hidden = true
      return
    }
    errorEl.textContent = message
    errorEl.hidden = false
  }

  const updateRelative = () => {
    if (!relativeEl) return
    relativeEl.textContent = formatRelative(lastState.lastUpdatedAt)
  }

  const render = (state) => {
    lastState = state

    if (statusEl) {
      statusEl.textContent = statusLabelMap[state.connectionStatus] ?? '—'
    }

    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = formatTimestamp(state.lastUpdatedAt)
    }

    updateRelative()
    updateError(state.errorMessage)

    if (connectBtn) {
      connectBtn.disabled = isBusy || state.connectionStatus !== 'disconnected' || !isSupported()
    }

    if (disconnectBtn) {
      disconnectBtn.disabled = isBusy || state.connectionStatus === 'disconnected'
    }
  }

  const supported = isSupported()
  if (!supported && helperEl) {
    helperEl.textContent = '이 환경은 Web Bluetooth 를 지원하지 않습니다. Chrome 또는 Edge에서 https:// 또는 http://localhost 주소로 접속해 주세요.'
  }

  setDisconnectedListener(() => {
    store.dispatch(actions.reset())
    store.dispatch(actions.setStatus('disconnected'))
    if (!manualDisconnect) {
      store.dispatch(actions.setError('디바이스 연결이 종료되었습니다.'))
    }
    manualDisconnect = false
  })

  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      const state = store.getState()
      if (state.connectionStatus !== 'disconnected' || isBusy || !isSupported()) {
        return
      }

      try {
        setBusy(true)
        store.dispatch(actions.setError(undefined))
        store.dispatch(actions.setStatus('connecting'))

        const device = await requestDevice()
        const { service, txCharacteristic } = await connectDevice(device)

        store.dispatch(actions.setDevice({ device, service, characteristic: txCharacteristic }))

        await startNotifications((value) => {
          const sample = parseSample(value)
          if (sample) {
            store.dispatch(actions.setSample(sample))
          }
        })

        await sendBmeCommand()
        store.dispatch(actions.setStatus('connected'))
      } catch (error) {
        console.error(error)
        try {
          await stopNotifications()
        } catch (_) {
          /* noop */
        }
        try {
          await disconnectDevice()
        } catch (_) {
          /* noop */
        }
        store.dispatch(actions.setStatus('disconnected'))
        const message = error instanceof Error ? error.message : '디바이스 연결 중 오류가 발생했습니다.'
        store.dispatch(actions.setError(message))
      } finally {
        setBusy(false)
      }
    })
  }

  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', async () => {
      const state = store.getState()
      if (state.connectionStatus === 'disconnected' || isBusy) {
        return
      }

      try {
        manualDisconnect = true
        setBusy(true)
        await stopNotifications()
        await disconnectDevice()
      } finally {
        store.dispatch(actions.reset())
        store.dispatch(actions.setStatus('disconnected'))
        setBusy(false)
      }
    })
  }

  const unsubscribe = store.subscribe(render)
  const interval = window.setInterval(updateRelative, 1000)

  return () => {
    unsubscribe?.()
    window.clearInterval(interval)
  }
}
