import { store, actions } from '../state.js'

const AXIS_ORDER = ['temperature', 'humidity', 'pressure']

const sortAxes = (axes) => {
  return AXIS_ORDER.filter((axis) => axes.includes(axis))
}

export const initAxisSelector = () => {
  const root = document.querySelector('[data-component="axis-selector"]')
  if (!root) return

  const labels = Array.from(root.querySelectorAll('.option'))

  const axisMap = new Map()
  labels.forEach((label) => {
    const axis = label.getAttribute('data-axis')
    if (!axis) return
    const input = label.querySelector('input[type="checkbox"]')
    if (!input) return
    axisMap.set(axis, { label, input })

    input.addEventListener('change', () => {
      const state = store.getState()
      const hasAxis = state.selectedAxes.includes(axis)
      let nextAxes
      if (hasAxis) {
        nextAxes = state.selectedAxes.filter((value) => value !== axis)
      } else {
        nextAxes = [...state.selectedAxes, axis]
      }

      nextAxes = sortAxes(nextAxes)

      if (nextAxes.length === 0) {
        input.checked = true
        return
      }

      store.dispatch(actions.setAxes(nextAxes))
    })
  })

  const render = (state) => {
    axisMap.forEach(({ label, input }, axis) => {
      const active = state.selectedAxes.includes(axis)
      if (input) input.checked = active
      if (label) label.setAttribute('data-active', String(active))
    })
  }

  const unsubscribe = store.subscribe(render)

  return () => unsubscribe?.()
}
