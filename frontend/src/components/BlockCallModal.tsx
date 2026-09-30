import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchWithAuth } from '../auth';
import { raiseFor } from '../lib/api';
import type { BlacklistReason } from './BlacklistPanel';

interface BlockCallModalProps {
  number: string;
  onClose: () => void;
  onBlocked?: () => void;
}

const REASONS: BlacklistReason[] = ['spam', 'children', 'hooligan', 'security'];

/**
 * Softphone modal: block the remote party for 24h (inbound only).
 * Visual pattern mirrors SupervisorModal (listen / whisper / barge).
 */
export function BlockCallModal({ number, onClose, onBlocked }: BlockCallModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<BlacklistReason>('spam');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = number.replace(/\D/g, '');

  const handleBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!digits) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/blacklist/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: digits, reason }),
      });
      if (!res.ok) await raiseFor(res);
      onBlocked?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('blacklist.blockFailed', 'Could not block number'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Ban size={20} style={{ color: 'var(--accent-danger)' }} />
            {t('blacklist.blockTitle', 'Block number')}
          </h3>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleBlock}>
          <div className="modal-body">
            <p style={{
              color: 'var(--text-secondary)',
              fontSize: 14,
              marginBottom: 20,
              lineHeight: 1.6,
            }}>
              {t('blacklist.blockDescription', 'Block this caller for 24 hours (inbound). A supervisor can review the entry later.')}
            </p>

            <div style={{
              background: 'var(--bg-secondary)',
              padding: 16,
              borderRadius: 'var(--radius-md)',
              marginBottom: 20,
              border: '1px solid var(--border-primary)',
            }}>
              <div style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 6,
              }}>
                {t('blacklist.col.number', 'Number')}
              </div>
              <div style={{
                fontSize: 24,
                fontWeight: 700,
                color: 'var(--accent-danger)',
                fontFamily: 'JetBrains Mono, monospace',
              }} dir="ltr">
                {digits || number}
              </div>
            </div>

            {error && (
              <div style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 16,
                background: 'var(--status-ringing-bg)', color: 'var(--status-ringing)',
              }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">{t('blacklist.col.reason', 'Reason')}</label>
              <select
                className="form-input"
                value={reason}
                onChange={(e) => setReason(e.target.value as BlacklistReason)}
                autoFocus
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`blacklist.reasons.${r}`, r)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>
              {t('blacklist.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || digits.length < 5 || digits.length > 15}
              style={{
                background: 'var(--accent-danger)',
                borderColor: 'var(--accent-danger)',
                opacity: saving || digits.length < 5 || digits.length > 15 ? 0.5 : 1,
              }}
            >
              <Ban size={14} />
              {saving ? t('blacklist.blocking', 'Blocking…') : t('blacklist.block', 'Block')}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
