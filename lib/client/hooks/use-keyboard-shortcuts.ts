import { useEffect } from 'react';
import { isTypingTarget, isComposingEvent } from '@/lib/client/commands/platform';

interface ShortcutConfig {
  onSearch?: () => void;
  onPrevPage?: () => void;
  onNextPage?: () => void;
}

/**
 * Page-local list shortcuts (currently the publications filter bar):
 *   /            focus the list's search input
 *   ← / →        previous / next page
 *
 * ⌘K used to live here too, but it now belongs to the single global command
 * palette (components/command). This is GitHub's exact split: ⌘K is the
 * app-wide palette, "/" is the page-local "search this list". Two listeners
 * fighting over ⌘K would be non-deterministic, so it was removed here on
 * purpose — not a silent regression.
 *
 * Guards: ignore IME composition / Dead keys (German accent keys) and any
 * typing target (inputs, textarea, select, contentEditable) via the shared
 * platform helpers, so the matcher behaves identically to the global layer.
 */
export function useKeyboardShortcuts({ onSearch, onPrevPage, onNextPage }: ShortcutConfig) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isComposingEvent(e)) return;
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (onSearch && e.key === '/') {
        e.preventDefault();
        onSearch();
      }
      if (e.key === 'ArrowLeft' && onPrevPage) {
        e.preventDefault();
        onPrevPage();
      }
      if (e.key === 'ArrowRight' && onNextPage) {
        e.preventDefault();
        onNextPage();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSearch, onPrevPage, onNextPage]);
}
