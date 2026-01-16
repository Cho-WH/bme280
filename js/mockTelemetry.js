import { store, actions } from './state.js'

const randomBetween = (min, max) => Math.random() * (max - min) + min
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export const initMockTelemetry = () => {
  let timerId = null
  let temperature = randomBetween(20, 26)
  let humidity = randomBetween(40, 60)
  let pressure = randomBetween(990, 1020)

  const pushSample = () => {
    temperature = clamp(temperature + randomBetween(-0.02, 0.02), 18, 30)
    humidity = clamp(humidity + randomBetween(-0.06, 0.06), 30, 80)
    pressure = clamp(pressure + randomBetween(-0.04, 0.04), 980, 1030)

    store.dispatch(
      actions.setSample({
        timestamp: Date.now(),
        temperature,
        humidity,
        pressure,
      })
    )
  }

  const start = () => {
    if (timerId) return
    timerId = window.setInterval(pushSample, 100)
  }

  const stop = () => {
    if (!timerId) return
    window.clearInterval(timerId)
    timerId = null
  }

  const handleState = (state) => {
    if (state.connectionStatus === 'connected') {
      stop()
    } else {
      start()
    }
  }

  const unsubscribe = store.subscribe(handleState)

  start()

  return () => {
    stop()
    unsubscribe?.()
  }
}
