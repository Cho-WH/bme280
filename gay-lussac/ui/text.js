// Preserve the existing text node (and browser selection) during routine refreshes.
export function setText(element, value) {
  const text = String(value ?? '');
  if (element.textContent !== text) element.textContent = text;
}
