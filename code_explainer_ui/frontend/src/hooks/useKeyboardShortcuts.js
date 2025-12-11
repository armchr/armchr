import { useEffect, useCallback } from 'react';

/**
 * Hook for managing keyboard shortcuts
 * @param {Object} shortcuts - Object mapping key combinations to handlers
 * @param {boolean} enabled - Whether shortcuts are enabled (disable when dialogs are open)
 *
 * Example usage:
 * useKeyboardShortcuts({
 *   'cmd+k': () => openCommandPalette(),
 *   'cmd+r': () => refresh(),
 *   'cmd+,': () => openSettings(),
 *   'escape': () => closeModal(),
 * }, !dialogOpen);
 */
const useKeyboardShortcuts = (shortcuts, enabled = true) => {
  const handleKeyDown = useCallback((event) => {
    if (!enabled) return;

    // Don't trigger shortcuts when typing in input fields
    const target = event.target;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      // Allow Escape in input fields
      if (event.key !== 'Escape') {
        return;
      }
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const cmdKey = isMac ? event.metaKey : event.ctrlKey;

    // Build the key combination string
    let keyCombo = '';
    if (cmdKey) keyCombo += 'cmd+';
    if (event.shiftKey) keyCombo += 'shift+';
    if (event.altKey) keyCombo += 'alt+';
    keyCombo += event.key.toLowerCase();

    // Check if we have a handler for this combination
    const handler = shortcuts[keyCombo];
    if (handler) {
      event.preventDefault();
      event.stopPropagation();
      handler(event);
    }
  }, [shortcuts, enabled]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
};

export default useKeyboardShortcuts;
