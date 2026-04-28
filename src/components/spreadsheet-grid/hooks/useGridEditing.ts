import { useCallback, useState } from 'react';
import type { GridMode } from '../types';

export function useGridEditing() {
  const [mode, setMode] = useState<GridMode>('navigate');
  const [draft, setDraft] = useState('');
  const [bulkHint, setBulkHint] = useState(false);

  const enterEdit = useCallback(
    (initial: string, options?: { bulk?: boolean }) => {
      setDraft(initial);
      setMode('edit');
      setBulkHint(!!options?.bulk);
    },
    []
  );

  const cancelEdit = useCallback(() => {
    setMode('navigate');
    setDraft('');
    setBulkHint(false);
  }, []);

  const commitDraft = useCallback(() => {
    return draft;
  }, [draft]);

  return {
    mode,
    setMode,
    draft,
    setDraft,
    bulkHint,
    setBulkHint,
    enterEdit,
    cancelEdit,
    commitDraft,
  };
}
