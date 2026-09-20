import type { KeyboardEvent, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { isCopyablePhone, useCopyToClipboard } from '../hooks/useCopyToClipboard';

interface CopyablePhoneProps {
  value: string | null | undefined;
  className?: string;
  /** Fallback when value is empty (default em dash). */
  empty?: string;
}

/**
 * Phone/extension that copies to the clipboard on click and shows a toast.
 * Renders a plain span when there is nothing to copy.
 */
export function CopyablePhone({ value, className, empty = '—' }: CopyablePhoneProps) {
  const { t } = useTranslation();
  const copy = useCopyToClipboard();
  const display = isCopyablePhone(value) ? value.trim() : empty;

  if (!isCopyablePhone(value)) {
    return <span className={className}>{display}</span>;
  }

  const onActivate = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation();
    void copy(value);
  };

  return (
    <span
      className={`copyable-phone${className ? ` ${className}` : ''}`}
      role="button"
      tabIndex={0}
      title={t('common.copyNumber')}
      aria-label={t('common.copyNumber')}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate(e);
        }
      }}
    >
      {display}
    </span>
  );
}
