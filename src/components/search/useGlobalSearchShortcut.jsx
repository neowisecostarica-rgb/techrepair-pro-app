/**
 * useGlobalSearchShortcut — registers Cmd/Ctrl+K to toggle the global search palette.
 * Returns nothing; just attaches/detaches the keydown listener.
 */
import { useEffect } from 'react';

export default function useGlobalSearchShortcut(onToggle) {
  useEffect(() => {
    const handler = (e) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        onToggle(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onToggle]);
}