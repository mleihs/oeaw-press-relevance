import { useEffect } from 'react';

interface ShortcutConfig {
  onSearch?: () => void;
  onPrevPage?: () => void;
  onNextPage?: () => void;
}

export function useKeyboardShortcuts({ onSearch, onPrevPage, onNextPage }: ShortcutConfig) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Cmd+K or / to focus search
      if (onSearch && ((e.metaKey && e.key === 'k') || e.key === '/')) {
        e.preventDefault();
        onSearch();
      }

      // Arrow keys for pagination
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
