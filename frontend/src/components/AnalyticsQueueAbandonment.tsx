import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileSpreadsheet, Search, X, Activity, PhoneMissed } from 'lucide-react';
import { fetchWithAuth } from '../auth';
import type { DateRange } from './analyticsUtils';
import type { AnalyticsQueueAbandonmentRecord } from '../types';
import { fmtSecs, analyticsGet, useAnalyticsFetch } from './analyticsUtils';
import { FilterSelect } from './FilterSelect';

type AbandonmentResponse = { rows: AnalyticsQueueAbandonmentRecord[]; total: number };

const PAGE_SIZE = 50;

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const dt = new Date(d.includes('T') ? d : d.replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

interface Props { dateRange: DateRange }

export function AnalyticsQueueAbandonment({ dateRange }: Props) {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [queue, setQueue] = useState('');
  const [disposition, setDisposition] = useState('');

  const hasFilters = !!(queue || disposition);

  function clearFilters() {
    setQueue('');
    setDisposition('');
  }

  const buildParams = useCallback((p: number) => {
    const params = new URLSearchParams({
      date_from: dateRange.from,
      date_to: dateRange.to,
      page: String(p),
      page_size: String(PAGE_SIZE),
    });
    if (queue) params.set('queue', queue);
    if (disposition) params.set('disposition', disposition);
    return params;
  }, [dateRange, queue, disposition]);

  useEffect(() => {
    setPage(1);
  }, [dateRange, queue, disposition]);

  const { data, loading, error } = useAnalyticsFetch(
    () => analyticsGet<AbandonmentResponse>(`/api/analytics/queue-abandonment?${buildParams(page)}`),
    [page, buildParams],
  );
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function downloadExport(format: 'csv' | 'xlsx') {
    setExporting(format);
    setExportError(null);
    try {
      const params = new URLSearchParams({
        format,
        date_from: dateRange.from,
        date_to: dateRange.to,
      });
      if (queue) params.set('queue', queue);
      if (disposition) params.set('disposition', disposition);
      const resp = await fetchWithAuth(`/api/analytics/queue-abandonment/export?${params}`);
      if (!resp.ok) throw new Error('Export failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `queue_abandonment_${dateRange.from}_${dateRange.to}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch {
      setExportError(t('analytics.abandonment.exportFailed', 'Export failed. Please try again.'));
    } finally {
      setExporting(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="an-filters">
        <div className="an-filter-group">
          <Search size={13} className="an-filter-icon" />
          <input
            className="an-filter-input"
            placeholder={t('analytics.abandonment.filterQueue', 'Queue...')}
            value={queue}
            onChange={e => setQueue(e.target.value)}
            style={{ width: 130 }}
          />
        </div>

        <FilterSelect
          value={disposition}
          onChange={setDisposition}
          icon={Activity}
          minWidth={160}
          options={[
            { value: '', label: t('analytics.abandonment.allDispositions', 'All Statuses') },
            { value: 'Abandoned', label: t('analytics.abandonment.abandoned', 'Abandoned'), dot: 'orange' },
            { value: 'Restored', label: t('analytics.abandonment.restored', 'Restored'), dot: 'green' },
          ]}
        />

        {hasFilters && (
          <button className="an-filter-clear" onClick={clearFilters}>
            <X size={12} />
            {t('analytics.abandonment.clearFilters', 'Clear')}
          </button>
        )}

        <span className="an-filter-count">
          {loading ? '…' : total.toLocaleString()} {t('analytics.abandonment.records', 'records')}
        </span>
      </div>

      <div className="an-section" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="an-loading"><div className="an-spinner" />{t('analytics.loading')}</div>
        ) : error ? (
          <div className="an-empty">{t('analytics.error')}</div>
        ) : rows.length === 0 ? (
          <div className="an-empty">
            <PhoneMissed size={28} style={{ opacity: 0.45, marginBottom: 8 }} />
            <div>{t('analytics.abandonment.empty', 'No abandoned queue callers for this period')}</div>
          </div>
        ) : (
          <div className="an-table-wrap">
            <table className="an-table">
              <thead>
                <tr>
                  <th className="sticky">{t('analytics.abandonment.date', 'Date')}</th>
                  <th>{t('analytics.abandonment.caller', 'Caller')}</th>
                  <th>{t('analytics.abandonment.destination', 'Destination')}</th>
                  <th>{t('analytics.abandonment.abandonedCount', 'Number of Abandoned')}</th>
                  <th>{t('analytics.abandonment.maxDuration', 'Max Duration')}</th>
                  <th>{t('analytics.abandonment.disposition', 'Disposition')}</th>
                  <th>{t('analytics.abandonment.restoringSpeed', 'Restoring Speed')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.caller}-${r.destination}-${r.date}-${i}`}>
                    <td className="sticky muted" style={{ whiteSpace: 'nowrap', fontSize: '0.77rem' }}>
                      {fmtDate(r.date)}
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.caller || '—'}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.destination || '—'}</td>
                    <td className="num">{r.abandoned_count}</td>
                    <td className="num">{fmtSecs(r.max_duration_secs)}</td>
                    <td>
                      <span className={`an-badge ${r.disposition === 'Restored' ? 'sla-met' : 'sla-fail'}`}>
                        {r.disposition === 'Restored'
                          ? t('analytics.abandonment.restored', 'Restored')
                          : t('analytics.abandonment.abandoned', 'Abandoned')}
                      </span>
                    </td>
                    <td className="num">
                      {r.restoring_speed_secs == null ? '—' : fmtSecs(r.restoring_speed_secs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="an-drilldown-footer">
        <div className="an-pagination">
          <button
            className="an-page-btn"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            aria-label="Previous page"
          >
            ‹
          </button>
          <span className="an-page-info">
            {t('analytics.abandonment.page', 'Page')} {page} / {totalPages}
          </span>
          <button
            className="an-page-btn"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            aria-label="Next page"
          >
            ›
          </button>
        </div>

        <div className="an-export-bar">
          {exportError && (
            <span style={{ color: 'var(--accent-danger)', fontSize: '0.78rem' }}>
              {exportError}
            </span>
          )}
          <button
            className="an-export-btn"
            onClick={() => downloadExport('csv')}
            disabled={exporting !== null || total === 0}
          >
            <Download size={13} />
            {exporting === 'csv' ? t('analytics.abandonment.exporting') : t('analytics.abandonment.exportCsv')}
          </button>
          <button
            className="an-export-btn"
            onClick={() => downloadExport('xlsx')}
            disabled={exporting !== null || total === 0}
          >
            <FileSpreadsheet size={13} />
            {exporting === 'xlsx' ? t('analytics.abandonment.exporting') : t('analytics.abandonment.exportXlsx')}
          </button>
        </div>
      </div>
    </div>
  );
}
