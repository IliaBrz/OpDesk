import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Edit2, Trash2, Ban, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchWithAuth } from '../auth';
import { Modal, Toggle, FormSection, FormRow, FormField, SearchInput } from './ui';
import { raiseFor } from '../lib/api';

export type BlacklistReason = 'spam' | 'children' | 'hooligan' | 'security';

export interface BlacklistEntry {
  id: number;
  number: string;
  reason: BlacklistReason;
  comment?: string;
  inbound: boolean;
  outbound: boolean;
  creator_id: number;
  reviewer_id: number | null;
  creator_username?: string | null;
  reviewer_username?: string | null;
  created_at: string;
  reviewed_at: string | null;
  unblock_at: string;
}

interface EntryForm {
  number: string;
  reason: BlacklistReason;
  comment: string;
  inbound: boolean;
  outbound: boolean;
  unblock_at: string;
}

const REASONS: BlacklistReason[] = ['spam', 'children', 'hooligan', 'security'];
const ITEMS_PER_PAGE = 25;

function digitsOnly(v: string) {
  return v.replace(/\D/g, '');
}

/** Local `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseServerDt(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  // Server may send "YYYY-MM-DD HH:MM:SS" — treat as local wall time.
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function defaultUnblockLocal(): string {
  return toLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000));
}

function blankForm(): EntryForm {
  return {
    number: '',
    reason: 'spam',
    comment: '',
    inbound: true,
    outbound: false,
    unblock_at: defaultUnblockLocal(),
  };
}

function formFromEntry(e: BlacklistEntry): EntryForm {
  const ub = parseServerDt(e.unblock_at);
  return {
    number: e.number,
    reason: e.reason,
    comment: e.comment || '',
    inbound: !!e.inbound,
    outbound: !!e.outbound,
    unblock_at: ub ? toLocalInputValue(ub) : defaultUnblockLocal(),
  };
}

/**
 * Supervisor/Admin CRUD for the custom phone blacklist.
 * Server-side pagination (25/page), Call History–style controls.
 */
export function BlacklistPanel() {
  const { t } = useTranslation();
  const [items, setItems] = useState<BlacklistEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | 'review' | null>(null);
  const [editing, setEditing] = useState<BlacklistEntry | null>(null);
  const [form, setForm] = useState<EntryForm>(blankForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIdx = total === 0 ? 0 : (safeCurrentPage - 1) * ITEMS_PER_PAGE;
  const endIdx = total === 0 ? 0 : Math.min(startIdx + items.length, total);

  const load = useCallback(async (q: string | undefined, page: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('page_size', String(ITEMS_PER_PAGE));
      if (q) params.set('q', q);
      const res = await fetchWithAuth(`/api/blacklist?${params.toString()}`);
      if (!res.ok) await raiseFor(res);
      const data = await res.json();
      setItems(data.items || []);
      setTotal(typeof data.total === 'number' ? data.total : 0);
    } catch {
      /* keep previous rows on transient failure */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(digitsOnly(search) || undefined, safeCurrentPage);
  }, [load, search, safeCurrentPage]);

  const onSearch = useCallback((q: string) => {
    setSearch(q);
    setCurrentPage(1);
  }, []);

  const reload = useCallback(() => {
    load(digitsOnly(search) || undefined, safeCurrentPage);
  }, [load, search, safeCurrentPage]);

  const openCreate = () => {
    setForm(blankForm());
    setEditing(null);
    setError(null);
    setModal('create');
  };

  const openEdit = (e: BlacklistEntry) => {
    setForm(formFromEntry(e));
    setEditing(e);
    setError(null);
    setModal('edit');
  };

  const openReview = (e: BlacklistEntry) => {
    setForm(formFromEntry(e));
    setEditing(e);
    setError(null);
    setModal('review');
  };

  const numberOk = useMemo(() => {
    const n = digitsOnly(form.number);
    return n.length >= 5 && n.length <= 15;
  }, [form.number]);

  const canSave = numberOk && !!form.unblock_at && (form.inbound || form.outbound);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const number = digitsOnly(form.number);
      if (modal === 'create') {
        const res = await fetchWithAuth('/api/blacklist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number,
            reason: form.reason,
            inbound: form.inbound,
            outbound: form.outbound,
            unblock_at: form.unblock_at,
            comment: form.comment.trim(),
          }),
        });
        if (!res.ok) await raiseFor(res);
        setCurrentPage(1);
      } else if (modal === 'edit' && editing) {
        const res = await fetchWithAuth(`/api/blacklist/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            number,
            reason: form.reason,
            inbound: form.inbound,
            outbound: form.outbound,
            unblock_at: form.unblock_at,
            comment: form.comment.trim(),
          }),
        });
        if (!res.ok) await raiseFor(res);
      } else if (modal === 'review' && editing) {
        const res = await fetchWithAuth(`/api/blacklist/${editing.id}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: form.reason,
            inbound: form.inbound,
            outbound: form.outbound,
            unblock_at: form.unblock_at,
            comment: form.comment.trim(),
          }),
        });
        if (!res.ok) await raiseFor(res);
      }
      setModal(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('blacklist.saveFailed', 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e: BlacklistEntry) => {
    if (!window.confirm(t('blacklist.confirmDelete', { number: e.number }))) return;
    const res = await fetchWithAuth(`/api/blacklist/${e.id}`, { method: 'DELETE' });
    if (res.ok) {
      // If we deleted the last item on a page > 1, step back.
      if (items.length <= 1 && safeCurrentPage > 1) {
        setCurrentPage((p) => Math.max(1, p - 1));
      } else {
        reload();
      }
    }
  };

  const reasonLabel = (r: BlacklistReason) => t(`blacklist.reasons.${r}`, r);

  const modalTitle =
    modal === 'create'
      ? t('blacklist.addTitle', 'Add to blacklist')
      : modal === 'review'
        ? t('blacklist.reviewTitle', 'Review blacklist entry')
        : t('blacklist.editTitle', 'Edit blacklist entry');

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <Ban size={16} className="panel-title-icon" />
          {t('blacklist.title', 'Blacklist')}
        </h2>
      </div>
      <div className="panel-content">
      <div className="notes-toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <span className="panel-subtitle">
          {t('blacklist.subtitle', 'Blocked numbers for inbound/outbound calls. Unreviewed entries appear first.')}
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginInlineStart: 'auto' }}>
          <SearchInput
            value={search}
            onChange={onSearch}
            label={t('blacklist.searchLabel', 'Search by number')}
            placeholder={t('blacklist.searchPlaceholder', 'Number…')}
            urlSync={false}
          />
          <button type="button" className="btn btn-primary notes-toolbar-action" onClick={openCreate}>
            <Plus size={14} /> {t('blacklist.add', 'Add')}
          </button>
        </div>
      </div>

      <div className="settings-users-table-wrap">
        <table className="settings-users-table">
          <thead>
            <tr>
              <th>{t('blacklist.col.id', 'ID')}</th>
              <th>{t('blacklist.col.number', 'Number')}</th>
              <th>{t('blacklist.col.reason', 'Reason')}</th>
              <th>{t('blacklist.col.comment', 'Comment')}</th>
              <th>{t('blacklist.col.direction', 'Direction')}</th>
              <th>{t('blacklist.col.created', 'Created')}</th>
              <th>{t('blacklist.col.reviewed', 'Reviewed')}</th>
              <th>{t('blacklist.col.unblock', 'Unblock')}</th>
              <th>{t('blacklist.col.creator', 'Creator')}</th>
              <th>{t('blacklist.col.reviewer', 'Reviewer')}</th>
              <th style={{ textAlign: 'end' }}>{t('blacklist.col.actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const pending = !row.reviewed_at;
              return (
                <tr key={row.id} style={pending ? { background: 'var(--bg-secondary)' } : undefined}>
                  <td className="notes-cell-strong" dir="ltr">{row.id}</td>
                  <td dir="ltr" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{row.number}</td>
                  <td>{reasonLabel(row.reason)}</td>
                  <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.comment || ''}>
                    {row.comment || '—'}
                  </td>
                  <td>
                    {row.inbound && <span className="badge badge-muted" style={{ marginInlineEnd: 4 }}>{t('blacklist.inbound', 'In')}</span>}
                    {row.outbound && <span className="badge badge-muted">{t('blacklist.outbound', 'Out')}</span>}
                  </td>
                  <td dir="ltr" style={{ fontSize: 12 }}>{row.created_at}</td>
                  <td dir="ltr" style={{ fontSize: 12 }}>
                    {row.reviewed_at || (
                      <span className="badge badge-warning">{t('blacklist.pending', 'Pending')}</span>
                    )}
                  </td>
                  <td dir="ltr" style={{ fontSize: 12 }}>{row.unblock_at}</td>
                  <td>{row.creator_username || row.creator_id}</td>
                  <td>{row.reviewer_username || (row.reviewer_id ?? '—')}</td>
                  <td>
                    <div className="notes-row-actions">
                      {pending && (
                        <button type="button" className="btn btn-icon" onClick={() => openReview(row)} title={t('blacklist.review', 'Review')}>
                          <CheckCircle2 size={13} />
                        </button>
                      )}
                      <button type="button" className="btn btn-icon" onClick={() => openEdit(row)} title={t('blacklist.edit', 'Edit')}>
                        <Edit2 size={13} />
                      </button>
                      <button type="button" className="btn btn-icon" onClick={() => remove(row)} title={t('blacklist.delete', 'Delete')}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={11} className="notes-table-empty">
                  {t('blacklist.none', 'No blacklist entries')}
                </td>
              </tr>
            )}
            {loading && items.length === 0 && (
              <tr>
                <td colSpan={11} className="notes-table-empty">{t('blacklist.loading', 'Loading…')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!loading && total > 0 && (
        <div className="cl-pagination">
          <span className="cl-pagination-info">
            {t('blacklist.showing', {
              start: startIdx + 1,
              end: endIdx,
              total,
              defaultValue: `Showing ${startIdx + 1} to ${endIdx} of ${total}`,
            })}
          </span>
          <div className="cl-pagination-controls">
            <button
              type="button"
              className="btn cl-page-btn"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={16} />
              {t('blacklist.previous', 'Previous')}
            </button>
            <span className="cl-page-current">{safeCurrentPage}</span>
            <button
              type="button"
              className="btn cl-page-btn"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              {t('blacklist.next', 'Next')}
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modalTitle}
        icon={<Ban size={16} />}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setModal(null)}>
              {t('blacklist.cancel', 'Cancel')}
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !canSave}>
              {saving
                ? t('blacklist.saving', 'Saving…')
                : modal === 'review'
                  ? t('blacklist.review', 'Review')
                  : t('blacklist.save', 'Save')}
            </button>
          </>
        }
      >
        {error && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 12,
            background: 'var(--status-ringing-bg)', color: 'var(--status-ringing)',
          }}>
            {error}
          </div>
        )}

        <FormSection title={t('blacklist.basic', 'Entry')} first>
          <FormRow>
            <FormField label={t('blacklist.col.number', 'Number')} required>
              <input
                className="form-input"
                dir="ltr"
                value={form.number}
                disabled={modal === 'review'}
                onChange={(e) => setForm((f) => ({ ...f, number: digitsOnly(e.target.value).slice(0, 15) }))}
                placeholder="79001234567"
              />
            </FormField>
            <FormField label={t('blacklist.col.reason', 'Reason')} required>
              <select
                className="form-input"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value as BlacklistReason }))}
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>{reasonLabel(r)}</option>
                ))}
              </select>
            </FormField>
          </FormRow>
          <FormRow single>
            <FormField label={t('blacklist.col.comment', 'Comment')}>
              <textarea
                className="form-input"
                rows={2}
                value={form.comment}
                maxLength={500}
                onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value.slice(0, 500) }))}
                placeholder={t('blacklist.commentPlaceholder', 'Optional note')}
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label={t('blacklist.col.unblock', 'Unblock at')} required>
              <input
                type="datetime-local"
                className="form-input"
                dir="ltr"
                value={form.unblock_at}
                onChange={(e) => setForm((f) => ({ ...f, unblock_at: e.target.value }))}
              />
            </FormField>
          </FormRow>
        </FormSection>

        <FormSection title={t('blacklist.direction', 'Direction')}>
          <FormRow single>
            <Toggle
              checked={form.inbound}
              onChange={(v) => setForm((f) => ({ ...f, inbound: v }))}
              label={t('blacklist.blockInbound', 'Block inbound')}
            />
          </FormRow>
          <FormRow single>
            <Toggle
              checked={form.outbound}
              onChange={(v) => setForm((f) => ({ ...f, outbound: v }))}
              label={t('blacklist.blockOutbound', 'Block outbound')}
            />
          </FormRow>
        </FormSection>
      </Modal>
      </div>
    </div>
  );
}
