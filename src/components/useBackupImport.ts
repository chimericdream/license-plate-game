import { useState } from 'react';
import { parseBackupFile, type ParsedBackup } from '../storage/backupZip';

/** Shared file-choosing logic for the "Import backup" buttons. */
export function useBackupImport() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ParsedBackup | null>(null);
  const [reading, setReading] = useState(false);

  const choose = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setReading(true);
    try {
      setPending(await parseBackupFile(file));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setReading(false);
    }
  };

  return { error, pending, reading, choose, close: () => setPending(null) };
}

export const BACKUP_FILE_TYPES = 'application/json,.json,application/zip,.zip';
