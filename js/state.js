const HISTORY_LIMIT = 300
const INITIAL_SELECTED_AXES = ['temperature']

const INITIAL_STATE = {
  connectionStatus: 'disconnected',
  device: undefined,
  service: undefined,
  characteristic: undefined,
  latestSample: undefined,
  history: [],
  selectedAxes: [...INITIAL_SELECTED_AXES],
  samplingIntervalMs: 100,
  lastUpdatedAt: undefined,
  errorMessage: undefined,
}

let currentState = { ...INITIAL_STATE }
const listeners = new Set()

const appendSample = (history, sample) => {
  const next = history.concat(sample)
  if (next.length > HISTORY_LIMIT) {
    return next.slice(next.length - HISTORY_LIMIT)
  }
  return next
}

const reducer = (state, action) => {
  switch (action.type) {
    case 'setStatus':
      return { ...state, connectionStatus: action.status }
    case 'setDevice':
      return { ...state, device: action.payload?.device, service: action.payload?.service, characteristic: action.payload?.characteristic }
    case 'setSample':
      return {
        ...state,
        latestSample: action.sample,
        history: appendSample(state.history, action.sample),
        lastUpdatedAt: action.sample.timestamp,
        errorMessage: undefined,
      }
    case 'setAxes': {
      if (!Array.isArray(action.axes) || action.axes.length === 0) {
        return state
      }
      return { ...state, selectedAxes: action.axes }
    }
    case 'setError':
      return { ...state, errorMessage: action.message }
    case 'reset':
      return {
        ...INITIAL_STATE,
        samplingIntervalMs: state.samplingIntervalMs,
      }
    default:
      return state
  }
}

const notify = () => {
  for (const listener of listeners) {
    listener(currentState)
  }
}

export const store = {
  getState() {
    return currentState
  },
  dispatch(action) {
    if (!action || typeof action.type !== 'string') {
      return
    }
    const nextState = reducer(currentState, action)
    if (nextState !== currentState) {
      currentState = nextState
      notify()
    }
  },
  subscribe(listener) {
    if (typeof listener !== 'function') {
      return () => {}
    }
    listeners.add(listener)
    listener(currentState)
    return () => {
      listeners.delete(listener)
    }
  },
}

export const constants = {
  HISTORY_LIMIT,
  INITIAL_SELECTED_AXES,
}

export const actions = {
  setStatus: (status) => ({ type: 'setStatus', status }),
  setDevice: (payload) => ({ type: 'setDevice', payload }),
  setSample: (sample) => ({ type: 'setSample', sample }),
  setAxes: (axes) => ({ type: 'setAxes', axes }),
  setError: (message) => ({ type: 'setError', message }),
  reset: () => ({ type: 'reset' }),
}
