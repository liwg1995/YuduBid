const pickerTypes = new Set(['date', 'datetime-local', 'month', 'time']);

/** Make the text area of native date and time inputs open the same picker as the icon. */
export function installDatePickerInteraction() {
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const input = event.target;
    if (!pickerTypes.has(input.type) || input.disabled || input.readOnly) return;

    // The native indicator already handles clicks on its own hit area.
    if (event instanceof MouseEvent && event.clientX >= input.getBoundingClientRect().right - 36) return;

    try {
      input.showPicker?.();
    } catch {
      // Keep the browser's native focus and editing behavior when unavailable.
    }
  });
}
