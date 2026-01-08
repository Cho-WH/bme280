(function () {
  if (typeof window === 'undefined') {
    return
  }

  if (typeof window.HTMLDialogElement !== 'undefined') {
    window.dialogPolyfill = window.dialogPolyfill || {
      registerDialog() {
        /* native support */
      },
    }
    return
  }

  const focusableSelectors = [
    'a[href]',
    'area[href]',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'button:not([disabled])',
    'iframe',
    'object',
    'embed',
    '[contenteditable]',
    '[tabindex]:not([tabindex="-1"])',
  ]

  const getFocusable = (root) => {
    return Array.from(root.querySelectorAll(focusableSelectors.join(','))).filter((el) =>
      el.offsetParent !== null || el === document.activeElement
    )
  }

  const registered = new WeakSet()

  const registerDialog = (dialog) => {
    if (!(dialog instanceof Element) || registered.has(dialog)) {
      return
    }

    registered.add(dialog)

    dialog.setAttribute('role', dialog.getAttribute('role') || 'dialog')
    dialog.setAttribute('aria-modal', 'true')

    let open = false
    let returnFocus = null

    const backdrop = document.createElement('div')
    backdrop.className = 'dialog-polyfill-backdrop'

    const updateOpenState = (nextOpen) => {
      open = nextOpen
      if (open) {
        dialog.setAttribute('open', '')
        dialog.classList.add('dialog-polyfill-open')
        backdrop.classList.add('dialog-polyfill-backdrop-open')
      } else {
        dialog.removeAttribute('open')
        dialog.classList.remove('dialog-polyfill-open')
        backdrop.classList.remove('dialog-polyfill-backdrop-open')
      }
    }

    const close = (returnValue) => {
      if (!open) return
      updateOpenState(false)
      if (dialog.getAttribute('tabindex') === '-1') {
        dialog.removeAttribute('tabindex')
      }
      backdrop.remove()
      dialog.dispatchEvent(new window.Event('close'))
      if (typeof returnValue === 'string') {
        dialog.returnValue = returnValue
      }
      if (returnFocus && typeof returnFocus.focus === 'function') {
        returnFocus.focus()
      }
      returnFocus = null
    }

    const showModal = () => {
      if (open) return
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      document.body.appendChild(backdrop)
      updateOpenState(true)
      const focusables = getFocusable(dialog)
      if (focusables.length > 0) {
        focusables[0].focus()
      } else {
        dialog.setAttribute('tabindex', '-1')
        dialog.focus()
      }
    }

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }

      if (event.key === 'Tab') {
        const focusables = getFocusable(dialog)
        if (focusables.length === 0) {
          event.preventDefault()
          return
        }

        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    const handleSubmit = (event) => {
      if (event.target instanceof HTMLFormElement && event.target.method === 'dialog') {
        event.preventDefault()
        const submitter = event.submitter || document.activeElement
        const value = submitter && 'value' in submitter ? submitter.value : ''
        close(value)
      }
    }

    backdrop.addEventListener('click', () => {
      close()
    })

    dialog.addEventListener('keydown', handleKeydown)
    dialog.addEventListener('submit', handleSubmit)

    dialog.showModal = showModal
    dialog.close = close

    Object.defineProperty(dialog, 'open', {
      get() {
        return open
      },
      set(value) {
        if (value) {
          showModal()
        } else {
          close()
        }
      },
      configurable: true,
    })
  }

  window.dialogPolyfill = {
    registerDialog,
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('dialog').forEach(registerDialog)
  })
})()
