const registerDialog = (dialog) => {
  if (!dialog) return
  if (dialog.open !== undefined && typeof dialog.showModal === 'function') {
    return
  }
  const polyfill = window.dialogPolyfill
  if (polyfill && typeof polyfill.registerDialog === 'function') {
    polyfill.registerDialog(dialog)
  }
}

export const initUsageGuide = () => {
  if (typeof document === 'undefined') {
    return
  }

  const openButton = document.querySelector('[data-action="open-usage-guide"]')
  const dialog = document.getElementById('usage-guide-dialog')

  if (!openButton || !dialog) {
    return
  }

  registerDialog(dialog)

  const handleOpen = () => {
    if (dialog.open) {
      return
    }
    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
    }
  }

  const handleBackdropClick = (event) => {
    if (event.target === dialog) {
      dialog.close()
    }
  }

  const handleClose = () => {
    if (typeof openButton.focus === 'function') {
      openButton.focus()
    }
  }

  openButton.addEventListener('click', handleOpen)
  dialog.addEventListener('click', handleBackdropClick)
  dialog.addEventListener('close', handleClose)

  return () => {
    openButton.removeEventListener('click', handleOpen)
    dialog.removeEventListener('click', handleBackdropClick)
    dialog.removeEventListener('close', handleClose)
  }
}
