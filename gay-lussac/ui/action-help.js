import { positionPopover } from './anchored-popover.js';

// Display-only help. It never reads or writes experiment / Workspace state.
// messages: { key: { label: '기능 이름', text: '짧은 설명' } } (plain strings also work).
export function createActionHelp(root, { messages }) {
  const doc = root.ownerDocument ?? root, win = doc.defaultView;
  const controller = new AbortController(), { signal } = controller;
  const panel = doc.createElement('div');
  panel.id = 'action-help-' + crypto.randomUUID();
  panel.className = 'action-help-popover';
  panel.setAttribute('role', 'tooltip');
  // An auto popover would dismiss open tool menus even on hover or focus.
  panel.setAttribute('popover', 'manual');
  doc.body.append(panel);
  const selector = 'button.help-trigger[data-action-help]';
  const originals = new Map();
  let anchor = null, hovered = null, overPanel = false, pinned = false;
  let suppressed = null, closeTimer = null, disposed = false;

  function message(button) {
    const key = button.dataset.actionHelp;
    if (!Object.hasOwn(messages, key)) return null;
    const value = messages[key];
    return typeof value === 'string' ? { text: value } : value;
  }
  function trigger(target) {
    const button = target?.closest?.(selector);
    return button && root.contains(button) && message(button)?.text ? button : null;
  }
  function prepare(button) {
    if (originals.has(button)) return;
    originals.set(button, Object.fromEntries(['aria-label', 'aria-describedby', 'aria-expanded', 'type']
      .map(name => [name, button.getAttribute(name)])));
    button.type = 'button';
    if (!button.hasAttribute('aria-label') && message(button)?.label) {
      button.setAttribute('aria-label', message(button).label + ' 도움말');
    }
    button.setAttribute('aria-expanded', 'false');
  }
  function clearTimer() { win.clearTimeout(closeTimer); closeTimer = null; }
  function close(suppress = true) {
    clearTimer();
    if (!anchor) return;
    suppressed = suppress && (hovered === anchor || doc.activeElement === anchor) ? anchor : null;
    anchor.setAttribute('aria-expanded', 'false');
    const describedBy = (anchor.getAttribute('aria-describedby') ?? '').split(/\s+/)
      .filter(id => id && id !== panel.id).join(' ');
    if (describedBy) anchor.setAttribute('aria-describedby', describedBy);
    else anchor.removeAttribute('aria-describedby');
    if (panel.matches(':popover-open')) panel.hidePopover();
    anchor = null; pinned = false; overPanel = false;
  }
  function position() {
    if (!anchor) return;
    if (!anchor.isConnected || anchor.closest('[hidden], [aria-hidden=true], [inert]') ||
        !anchor.getClientRects().length || win.getComputedStyle(anchor).visibility !== 'visible') {
      close(false); return;
    }
    positionPopover(panel, anchor);
    const rect = anchor.getBoundingClientRect(), height = panel.offsetHeight;
    const below = win.innerHeight - rect.bottom - 8, above = rect.top - 8;
    if (below < height + 4 && above > below) {
      panel.style.top = Math.max(8, rect.top - height - 4) + 'px';
    }
  }
  function open(button, pin = false) {
    if (disposed || (!pin && button === suppressed)) return;
    clearTimer();
    if (anchor === button) { pinned ||= pin; return; }
    close(false); suppressed = null; prepare(button);
    anchor = button; pinned = pin;
    panel.textContent = message(button).text;
    // Keep help usable inside a modal dialog as well as ordinary screens.
    (button.closest('dialog[open]') ?? doc.body).append(panel);
    const ids = (button.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
    button.setAttribute('aria-describedby', [...new Set([...ids, panel.id])].join(' '));
    button.setAttribute('aria-expanded', 'true');
    panel.showPopover(); position();
  }
  function scheduleClose() {
    clearTimer();
    closeTimer = win.setTimeout(() => {
      if (anchor && !pinned && hovered !== anchor && !overPanel && doc.activeElement !== anchor) close(false);
    }, 180);
  }
  function pointerOver(event) {
    if (event.pointerType === 'touch') return;
    const button = trigger(event.target);
    if (!button || button.contains(event.relatedTarget)) return;
    hovered = button; open(button);
  }
  function pointerOut(event) {
    const button = trigger(event.target);
    if (!button || button.contains(event.relatedTarget)) return;
    if (hovered === button) hovered = null;
    if (suppressed === button) suppressed = null;
    scheduleClose();
  }
  root.addEventListener('pointerover', pointerOver, { signal });
  root.addEventListener('pointerout', pointerOut, { signal });
  root.addEventListener('focusin', event => {
    const button = trigger(event.target);
    if (button) open(button);
  }, { signal });
  root.addEventListener('focusout', event => {
    if (suppressed === event.target && hovered !== event.target) suppressed = null;
    if (event.target === anchor && !panel.contains(event.relatedTarget)) {
      pinned = false; scheduleClose();
    }
  }, { signal });
  doc.addEventListener('pointerdown', event => {
    if (trigger(event.target)) {
      // Pointer help must not blur an edited field or move focus/scroll.
      event.preventDefault(); event.stopPropagation();
    } else if (!panel.contains(event.target)) close();
  }, { signal, capture: true });
  root.addEventListener('click', event => {
    const button = trigger(event.target);
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    if (anchor === button && pinned) close();
    else { suppressed = null; open(button, true); }
  }, { signal, capture: true });
  doc.addEventListener('click', event => {
    if (!trigger(event.target) && !panel.contains(event.target)) close();
  }, { signal, capture: true });
  doc.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !anchor) return;
    event.preventDefault(); event.stopPropagation(); close();
  }, { signal, capture: true });
  panel.addEventListener('pointerenter', () => { overPanel = true; clearTimer(); }, { signal });
  panel.addEventListener('pointerleave', () => { overPanel = false; scheduleClose(); }, { signal });
  win.addEventListener('resize', position, { signal });
  win.addEventListener('scroll', position, { signal, capture: true, passive: true });
  doc.addEventListener('toggle', event => {
    if (anchor && event.newState === 'closed' && event.target.contains(anchor)) close(false);
  }, { signal, capture: true });
  // Screen changes / conditional controls can hide or remove an open anchor.
  const observer = new MutationObserver(records => {
    if (anchor && !anchor.isConnected) close(false);
    // Unrelated chart/table content changes need no help measurement. Attribute
    // changes on the anchor's ancestry and changes inside it can affect visibility
    // or size; the popover's own positioning styles must never feed back here.
    if (anchor && records.some(record => record.target !== panel && (
      (record.type === 'attributes' && (record.target.contains(anchor) ||
        (record.attributeName === 'hidden' && record.target.parentElement === anchor.parentElement))) ||
      anchor.contains(record.target)
    ))) position();
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.matches?.(selector)) prepare(node);
        for (const button of node.querySelectorAll?.(selector) ?? []) prepare(button);
      }
    }
  });
  observer.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'inert', 'class', 'style'] });
  for (const button of root.querySelectorAll(selector)) prepare(button);

  return {
    close,
    dispose() {
      if (disposed) return;
      close(); disposed = true; controller.abort(); observer.disconnect(); panel.remove();
      for (const [button, attributes] of originals) {
        for (const [name, value] of Object.entries(attributes)) {
          if (value === null) button.removeAttribute(name);
          else button.setAttribute(name, value);
        }
      }
      originals.clear();
    },
  };
}
