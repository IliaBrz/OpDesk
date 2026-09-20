import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotify } from '../contexts/NotificationContext';

/** True when the value looks like a real phone/extension worth copying. */
export function isCopyablePhone(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== '—' && trimmed !== '-';
}

/**
 * Copy text to the clipboard and show the same toast style as
 * "Connected to server" (`.notifications`).
 */
export function useCopyToClipboard() {
  const notify = useNotify();
  const { t } = useTranslation();

  return useCallback(
    async (text: string | null | undefined) => {
      if (!isCopyablePhone(text)) return;
      const value = text.trim();
      try {
        await navigator.clipboard.writeText(value);
        notify(t('common.copied'));
      } catch {
        // Clipboard may be blocked (insecure context / permissions).
      }
    },
    [notify, t],
  );
}
