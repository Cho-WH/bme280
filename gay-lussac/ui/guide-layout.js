// Measure an inert copy, keeping the live controls, focus and device state untouched.
export function createGuideLayout({ content, progress, steps, measureSteps, createMeasurement }) {
  let measuredWidth = 0, measuredFont = '', lastStep = null;
  let animation = null, disposed = false;
  const stepOrder = new Map(steps.map((step, index) => [step.id, index]));
  const motion = matchMedia('(prefers-reduced-motion: reduce)');

  function measure(force = false) {
    if (disposed) return;
    const width = content.getBoundingClientRect().width;
    if (!width) return;
    const font = getComputedStyle(content).fontSize;
    if (!force && width === measuredWidth && font === measuredFont) return;
    measuredWidth = width; measuredFont = font;
    let height = 0;
    for (const step of measureSteps) {
      const copy = createMeasurement(step);
      copy.inert = true;
      copy.setAttribute('aria-hidden', 'true');
      copy.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;width:${width}px;height:auto;min-height:0;contain:layout;`;
      content.parentElement.append(copy);
      try {
        height = Math.max(height, copy.getBoundingClientRect().height);
      } finally { copy.remove(); }
    }
    content.style.setProperty('--wiring-content-height', `${Math.ceil(height)}px`);
  }

  function syncProgress() {
    if (disposed) return;
    const button = progress.querySelector('[aria-current="step"]');
    const track = progress.getBoundingClientRect();
    if (!button || !track.width) return;
    const bounds = button.getBoundingClientRect();
    progress.style.setProperty('--active-step-x', `${bounds.left - track.left + progress.scrollLeft}px`);
    progress.style.setProperty('--active-step-width', `${bounds.width}px`);
  }

  function transition(stepId) {
    if (disposed || lastStep === stepId) return;
    const previous = lastStep;
    lastStep = stepId;
    animation?.cancel();
    animation = null;
    if (!previous || motion.matches) return;
    const direction = stepOrder.get(stepId) > stepOrder.get(previous) ? 1 : -1;
    const style = getComputedStyle(content);
    animation = content.animate(
      [{ transform: `translateX(${direction * 20}px)`, opacity: 0.65 }, { transform: 'translateX(0)', opacity: 1 }],
      { duration: parseFloat(style.getPropertyValue('--guide-motion-duration')), easing: style.getPropertyValue('--guide-motion-easing').trim() },
    );
  }
  const observer = new ResizeObserver(() => { measure(); syncProgress(); });
  observer.observe(content);
  observer.observe(progress);
  const fontsChanged = () => { measure(true); syncProgress(); };
  document.fonts?.addEventListener('loadingdone', fontsChanged);
  document.fonts?.ready.then(fontsChanged);
  const motionChanged = () => { if (motion.matches) animation?.cancel(); };
  motion.addEventListener('change', motionChanged);
  return { measure, syncProgress, transition, dispose() {
    disposed = true;
    observer.disconnect();
    document.fonts?.removeEventListener('loadingdone', fontsChanged);
    motion.removeEventListener('change', motionChanged);
    animation?.cancel();
  } };
}
