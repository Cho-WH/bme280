import { createExperimentGuidePreferences } from '../guide/experiment-guide-preferences.js';

export function createExperimentGuide(dialog, { preferences = createExperimentGuidePreferences() } = {}) {
  const checkbox = dialog.querySelector('[data-suppress-guide]');
  const heading = dialog.querySelector('h2');
  const recording = dialog.querySelector('[data-guide-recording]');
  const body = dialog.querySelector('[data-guide-body]');
  const pages = [...dialog.querySelectorAll('[data-guide-page]')];
  const pageButtons = [...dialog.querySelectorAll('[data-guide-page-button]')];
  const previous = dialog.querySelector('[data-guide-previous]');
  const next = dialog.querySelector('[data-guide-next]');
  const nextLabel = next.querySelector('[data-guide-next-label]');
  const nextArrow = next.querySelector('[aria-hidden="true"]');
  const count = dialog.querySelector('[data-guide-count]');
  const controller = new AbortController();
  const options = { signal: controller.signal };
  let returnFocus = null;
  let pageIndex = 0;
  function showPage(index, animate = true) {
    const target = Math.max(0, Math.min(pages.length - 1, index));
    const direction = target < pageIndex ? -1 : 1;
    pages.forEach((page, i) => { page.hidden = i !== target; });
    pageButtons.forEach((button, i) => {
      if (i === target) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
    previous.disabled = target === 0;
    nextLabel.textContent = target === pages.length - 1 ? '측정하러 가기' : '다음';
    nextArrow.hidden = target === pages.length - 1;
    count.textContent = `${target + 1} / ${pages.length}`;
    count.setAttribute('aria-label', `${target + 1} / ${pages.length} · ${pages[target].querySelector('h3').textContent}`);
    body.scrollTop = 0;
    if (animate && target !== pageIndex && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      pages[target].getAnimations().forEach(animation => animation.cancel());
      pages[target].animate([{ opacity: 0, transform: `translateX(${direction * 10}px)` },
        { opacity: 1, transform: 'translateX(0)' }], { duration: 180, easing: 'ease-out' });
    }
    pageIndex = target;
  }
  previous.addEventListener('click', () => showPage(pageIndex - 1), options);
  next.addEventListener('click', () => {
    if (pageIndex === pages.length - 1) dialog.close();
    else showPage(pageIndex + 1);
  }, options);
  pageButtons.forEach((button, i) => {
    button.addEventListener('click', () => showPage(i), options);
    button.addEventListener('keydown', event => {
      const target = event.key === 'ArrowRight' ? (i + 1) % pages.length
        : event.key === 'ArrowLeft' ? (i - 1 + pages.length) % pages.length
          : event.key === 'Home' ? 0 : event.key === 'End' ? pages.length - 1 : null;
      if (target === null) return;
      event.preventDefault(); showPage(target); pageButtons[target].focus();
    }, options);
  });
  dialog.querySelectorAll('[data-close-guide]').forEach(button => {
    button.addEventListener('click', () => dialog.close(), options);
  });
  checkbox.addEventListener('change', () => preferences.setSuppressed(checkbox.checked), options);
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    if (returnFocus?.isConnected && returnFocus.getClientRects().length) {
      returnFocus.focus({ preventScroll: true });
    }
    returnFocus = null;
  }, options);
  return {
    show({ runId, automatic = false, anchor = document.activeElement } = {}) {
      if (dialog.open || (automatic && !preferences.shouldShow(runId))) return false;
      checkbox.checked = preferences.isSuppressed();
      returnFocus = anchor;
      showPage(0, false);
      dialog.showModal();
      preferences.markSeen(runId);
      body.scrollTop = 0;
      heading.focus({ preventScroll: true });
      return true;
    },
    setRecording(active) { recording.hidden = !active; },
    close() { returnFocus = null; if (dialog.open) dialog.close(); },
    forget: preferences.forget,
    dispose() { returnFocus = null; controller.abort(); if (dialog.open) dialog.close(); },
  };
}
