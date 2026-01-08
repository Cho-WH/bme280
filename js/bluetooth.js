const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
const FALLBACK_TX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'
const FALLBACK_RX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'
const CCCD_UUID = '00002902-0000-1000-8000-00805f9b34fb'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

let device = null
let service = null
let txCharacteristic = null
let rxCharacteristic = null
let notificationHandler = null
let disconnectListener = null
let rxBuffer = ''

const resetInternals = () => {
  device = null
  service = null
  txCharacteristic = null
  rxCharacteristic = null
  notificationHandler = null
  rxBuffer = ''
}

const assertBluetoothAvailability = () => {
  if (typeof navigator === 'undefined' || !navigator.bluetooth) {
    throw new Error('이 브라우저에서는 Web Bluetooth API를 사용할 수 없습니다.')
  }
}

const removeGattListener = () => {
  if (device) {
    try {
      device.removeEventListener('gattserverdisconnected', handleGattDisconnection)
    } catch (error) {
      // ignore
    }
  }
}

const emitDisconnected = () => {
  if (typeof disconnectListener === 'function') {
    disconnectListener()
  }
}

const handleNotification = (event) => {
  const target = event.target
  if (!target || !target.value) {
    return
  }
  const chunk = decoder.decode(target.value)
  rxBuffer += chunk

  let newlineIndex = rxBuffer.indexOf('\n')
  while (newlineIndex !== -1) {
    const rawLine = rxBuffer.slice(0, newlineIndex)
    rxBuffer = rxBuffer.slice(newlineIndex + 1)
    const normalized = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    const trimmed = normalized.trim()
    if (notificationHandler && trimmed.length > 0) {
      notificationHandler(trimmed)
    }
    newlineIndex = rxBuffer.indexOf('\n')
  }
}

function handleGattDisconnection() {
  removeGattListener()
  resetInternals()
  emitDisconnected()
}

export const isSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth

export const setDisconnectedListener = (listener) => {
  disconnectListener = listener
}

const deviceFilters = [
  { namePrefix: 'BBC micro:bit' },
  { namePrefix: 'micro:bit' },
  { namePrefix: 'BBC microbit' },
]

export const requestDevice = async () => {
  assertBluetoothAvailability()
  const requested = await navigator.bluetooth.requestDevice({
    filters: deviceFilters,
    optionalServices: [UART_SERVICE_UUID],
  })

  requested.addEventListener('gattserverdisconnected', handleGattDisconnection)
  device = requested
  return requested
}

export const connect = async (selectedDevice) => {
  assertBluetoothAvailability()
  device = selectedDevice

  const server = await device.gatt?.connect()
  if (!server) {
    throw new Error('GATT 서버에 연결하지 못했습니다.')
  }

  service = await server.getPrimaryService(UART_SERVICE_UUID)

  const characteristics = await service.getCharacteristics()
  const classifyCharacteristic = async (characteristic) => {
    const props = characteristic.properties || {}
    let descriptors = []
    try {
      descriptors = (await characteristic.getDescriptors?.()) || []
    } catch (error) {
      // descriptor enumeration is optional; ignore failures
    }
    const descriptorIds = descriptors.map((descriptor) => descriptor.uuid?.toLowerCase?.())
    const hasNotifyFlag = !!(props.notify || props.indicate)
    const hasCccd = descriptorIds.includes(CCCD_UUID)

    return {
      characteristic,
      props,
      descriptorIds,
      supportsWrite: !!(props.write || props.writeWithoutResponse),
      supportsNotify: hasNotifyFlag || hasCccd,
    }
  }

  const classified = await Promise.all(characteristics.map(classifyCharacteristic))

  txCharacteristic = classified.find((item) => item.supportsWrite)?.characteristic || null
  rxCharacteristic = classified.find((item) => item.supportsNotify)?.characteristic || null

  if (!txCharacteristic || !rxCharacteristic) {
    const fallbackTx = classified.find((item) => item.characteristic.uuid?.toLowerCase?.() === FALLBACK_TX_CHARACTERISTIC_UUID)
    const fallbackRx = classified.find((item) => item.characteristic.uuid?.toLowerCase?.() === FALLBACK_RX_CHARACTERISTIC_UUID)
    if (!txCharacteristic && fallbackTx) {
      txCharacteristic = fallbackTx.characteristic
    }
    if (!rxCharacteristic && fallbackRx) {
      rxCharacteristic = fallbackRx.characteristic
    }
  }

  if (!txCharacteristic) {
    throw new Error('쓰기 가능한 BLE 특성을 찾지 못했습니다.')
  }
  if (!rxCharacteristic) {
    throw new Error('알림을 지원하는 BLE 특성을 찾지 못했습니다.')
  }

  return {
    service,
    txCharacteristic,
    rxCharacteristic,
  }
}

export const disconnect = async () => {
  if (rxCharacteristic) {
    rxCharacteristic.removeEventListener('characteristicvaluechanged', handleNotification)
    try {
      await rxCharacteristic.stopNotifications()
    } catch (error) {
      console.warn('Failed to stop notifications', error)
    }
  }

  const hadDevice = !!device
  removeGattListener()

  if (device?.gatt?.connected) {
    device.gatt.disconnect()
  }

  resetInternals()
  if (hadDevice) {
    emitDisconnected()
  }
}

export const startNotifications = async (handler) => {
  if (!rxCharacteristic) {
    throw new Error('UART RX characteristic이 아직 준비되지 않았습니다.')
  }

  notificationHandler = handler
  rxCharacteristic.addEventListener('characteristicvaluechanged', handleNotification)
  await rxCharacteristic.startNotifications()
}

export const stopNotifications = async () => {
  if (!rxCharacteristic) {
    return
  }

  rxBuffer = ''
  rxCharacteristic.removeEventListener('characteristicvaluechanged', handleNotification)
  try {
    await rxCharacteristic.stopNotifications()
  } catch (error) {
    console.warn('Failed to stop notifications', error)
  }
}

export const sendBmeCommand = async () => {
  if (!txCharacteristic) {
    throw new Error('UART TX characteristic이 아직 준비되지 않았습니다.')
  }

  const payload = encoder.encode('bme\n')
  await txCharacteristic.writeValue(payload)
}

export const getContext = () => ({
  device,
  service,
  txCharacteristic,
  rxCharacteristic,
})
