import { useState } from 'react';
import type { StoreData } from '../domain/types';
import { parseBackup } from '../storage/backup';

/** Shared file-choosing logic for the "Import backup" buttons. */
export function useBackupImport() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<StoreData | null>(null);

  const choose = async (file: File | null) => {
    if (!file) return;
    setError(null);
    try {
      setPending(parseBackup(await file.text()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return { error, pending, choose, close: () => setPending(null) };
}
