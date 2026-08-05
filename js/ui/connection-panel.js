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
  waiting_data: '데이터 대기 중',
  connected: '연결됨',
}

const FIRST_SAMPLE_TIMEOUT_MS = 3000
const START_COMMAND_RETRY_INTERVAL_MS = 300
const START_COMMAND_RETRY_LIMIT = 5
const RECONNECT_COOLDOWN_MS = 2000

const FIRST_SAMPLE_TIMEOUT_MESSAGE =
  'micro:bit와 연결됐지만 센서 데이터가 수신되지 않습니다. bmx280_ble_v2-dev.hex 펌웨어와 BMP280/BME280 배선을 확인하세요.'
const UNEXPECTED_DISCONNECT_MESSAGE =
  '디바이스 연결이 종료되었습니다. micro:bit 전원과 거리를 확인한 뒤 다시 연결하세요.'
const RECONNECT_COOLDOWN_MESSAGE = 'micro:bit 연결을 정리하는 중입니다. 잠시 후 다시 연결하세요.'

const getConnectionErrorMessage = (error) => {
  if (!(error instanceof Error)) {
    return '디바이스 연결 중 오류가 발생했습니다.'
  }

  if (error.name === 'NotFoundError') {
    return '장치 선택이 취소되었거나 조건에 맞는 micro:bit를 찾지 못했습니다.'
  }
  if (error.name === 'NotAllowedError') {
    return 'Bluetooth 권한이 거부되었습니다. 브라우저 또는 운영체제 권한을 허용해 주세요.'
  }
  if (error.name === 'SecurityError') {
    return 'Web Bluetooth는 HTTPS 또는 localhost 주소에서만 사용할 수 있습니다.'
  }
  if (error.name === 'NetworkError') {
    return 'Bluetooth 연결이 중간에 끊겼습니다. micro:bit 전원, 거리, 다른 기기 연결 여부를 확인하세요.'
  }

  const message = error.message || ''
  if (message.includes('getPrimaryService') || message.includes('UART') || message.includes('BLE 특성')) {
    return '선택한 micro:bit에서 센서용 UART 서비스를 찾지 못했습니다. bmx280_ble_v2-dev.hex 펌웨어가 플래시되어 있는지 확인하세요.'
  }
  if (message.includes('GATT')) {
    return 'micro:bit GATT 서버에 연결하지 못했습니다. 전원을 확인하고 잠시 후 다시 시도하세요.'
  }

  return message || '디바이스 연결 중 오류가 발생했습니다.'
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
  const supportedDialogEl = document.getElementById('supported-browsers-dialog')
  const defaultHelperHtml = helperEl?.innerHTML ?? ''

  if (supportedDialogEl && window.dialogPolyfill && typeof window.dialogPolyfill.registerDialog === 'function') {
    window.dialogPolyfill.registerDialog(supportedDialogEl)
  }

  const supportedDialog =
    supportedDialogEl && typeof supportedDialogEl.showModal === 'function' ? supportedDialogEl : null

  let supportedDialogTrigger = null

  if (helperEl && supportedDialog) {
    helperEl.addEventListener('click', (event) => {
      const trigger = event.target?.closest?.('[data-action="show-supported"]')
      if (!trigger) return
      supportedDialogTrigger = trigger
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
      if (supportedDialogTrigger?.isConnected) {
        supportedDialogTrigger.focus()
      }
    })
  }

  let isBusy = false
  let manualDisconnect = false
  let suppressDisconnectMessage = false
  let isReconnectCoolingDown = false
  let connectionAttemptId = 0
  let firstSampleTimeoutId = null
  let commandRetryIntervalId = null
  let reconnectCooldownTimeoutId = null
  let lastState = store.getState()

  const updateControls = () => {
    if (connectBtn) {
      connectBtn.disabled = isBusy || isReconnectCoolingDown || lastState.connectionStatus !== 'disconnected' || !isSupported()
    }
    if (disconnectBtn) {
      disconnectBtn.disabled = isBusy || lastState.connectionStatus === 'disconnected'
    }
  }

  const setBusy = (busy) => {
    isBusy = busy
    updateControls()
  }

  const clearConnectionTimers = () => {
    if (firstSampleTimeoutId) {
      window.clearTimeout(firstSampleTimeoutId)
      firstSampleTimeoutId = null
    }
    if (commandRetryIntervalId) {
      window.clearInterval(commandRetryIntervalId)
      commandRetryIntervalId = null
    }
  }

  const resetHelper = () => {
    if (!helperEl || !isSupported()) return
    helperEl.innerHTML = defaultHelperHtml
  }

  const beginReconnectCooldown = () => {
    if (!helperEl || !isSupported()) return
    if (reconnectCooldownTimeoutId) {
      window.clearTimeout(reconnectCooldownTimeoutId)
    }
    isReconnectCoolingDown = true
    helperEl.textContent = RECONNECT_COOLDOWN_MESSAGE
    updateControls()
    reconnectCooldownTimeoutId = window.setTimeout(() => {
      isReconnectCoolingDown = false
      reconnectCooldownTimeoutId = null
      resetHelper()
      updateControls()
    }, RECONNECT_COOLDOWN_MS)
  }

  const cleanupConnection = async (message) => {
    connectionAttemptId += 1
    clearConnectionTimers()
    suppressDisconnectMessage = true
    setBusy(true)
    try {
      await stopNotifications()
    } catch (_) {
      /* noop */
    }
    try {
      await disconnectDevice()
    } catch (_) {
      /* noop */
    } finally {
      suppressDisconnectMessage = false
      store.dispatch(actions.reset())
      store.dispatch(actions.setStatus('disconnected'))
      if (message) {
        store.dispatch(actions.setError(message))
      }
      setBusy(false)
    }
  }

  const stopStartCommandRetries = () => {
    if (!commandRetryIntervalId) return
    window.clearInterval(commandRetryIntervalId)
    commandRetryIntervalId = null
  }

  const startBmeCommandRetries = (attemptId) => {
    let attempts = 0
    let isSending = false

    const sendOnce = async () => {
      if (attemptId !== connectionAttemptId || isSending || store.getState().connectionStatus !== 'waiting_data') {
        stopStartCommandRetries()
        return
      }
      if (attempts >= START_COMMAND_RETRY_LIMIT) {
        stopStartCommandRetries()
        return
      }

      attempts += 1
      isSending = true
      try {
        await sendBmeCommand()
      } catch (error) {
        console.warn('Failed to send BME start command', error)
      } finally {
        isSending = false
      }
    }

    sendOnce()
    commandRetryIntervalId = window.setInterval(sendOnce, START_COMMAND_RETRY_INTERVAL_MS)
  }

  const startFirstSampleTimeout = (attemptId) => {
    if (firstSampleTimeoutId) {
      window.clearTimeout(firstSampleTimeoutId)
    }
    firstSampleTimeoutId = window.setTimeout(() => {
      if (attemptId !== connectionAttemptId || store.getState().connectionStatus !== 'waiting_data') {
        return
      }
      cleanupConnection(FIRST_SAMPLE_TIMEOUT_MESSAGE)
    }, FIRST_SAMPLE_TIMEOUT_MS)
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

    updateControls()
  }

  const supported = isSupported()
  if (!supported && helperEl) {
    helperEl.textContent = '이 환경은 Web Bluetooth 를 지원하지 않습니다. Chrome 또는 Edge에서 https:// 또는 http://localhost 주소로 접속해 주세요.'
  }

  setDisconnectedListener(() => {
    connectionAttemptId += 1
    clearConnectionTimers()
    store.dispatch(actions.reset())
    store.dispatch(actions.setStatus('disconnected'))
    if (!manualDisconnect && !suppressDisconnectMessage) {
      store.dispatch(actions.setError(UNEXPECTED_DISCONNECT_MESSAGE))
    }
    manualDisconnect = false
    suppressDisconnectMessage = false
  })

  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      const state = store.getState()
      if (state.connectionStatus !== 'disconnected' || isBusy || !isSupported()) {
        return
      }

      const attemptId = connectionAttemptId + 1
      connectionAttemptId = attemptId
      clearConnectionTimers()

      try {
        setBusy(true)
        manualDisconnect = false
        suppressDisconnectMessage = false
        store.dispatch(actions.setError(undefined))
        store.dispatch(actions.setStatus('connecting'))

        const device = await requestDevice()
        const { service, txCharacteristic } = await connectDevice(device)

        store.dispatch(actions.setDevice({ device, service, characteristic: txCharacteristic }))

        await startNotifications((value) => {
          if (attemptId !== connectionAttemptId) {
            return
          }
          const sample = parseSample(value)
          if (sample) {
            clearConnectionTimers()
            store.dispatch(actions.setSample(sample))
          }
        })

        store.dispatch(actions.setStatus('waiting_data'))
        startFirstSampleTimeout(attemptId)
        startBmeCommandRetries(attemptId)
      } catch (error) {
        console.error(error)
        if (attemptId === connectionAttemptId) {
          await cleanupConnection(getConnectionErrorMessage(error))
        }
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
        connectionAttemptId += 1
        clearConnectionTimers()
        manualDisconnect = true
        setBusy(true)
        await stopNotifications()
        await disconnectDevice()
      } finally {
        store.dispatch(actions.reset())
        store.dispatch(actions.setStatus('disconnected'))
        setBusy(false)
        beginReconnectCooldown()
      }
    })
  }

  const unsubscribe = store.subscribe(render)
  const interval = window.setInterval(updateRelative, 1000)

  return () => {
    unsubscribe?.()
    window.clearInterval(interval)
    clearConnectionTimers()
    if (reconnectCooldownTimeoutId) {
      window.clearTimeout(reconnectCooldownTimeoutId)
    }
  }
}
