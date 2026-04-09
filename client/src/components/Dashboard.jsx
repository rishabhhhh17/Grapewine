/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';
import SearchPanel from './SearchPanel';
import EmailPreviewPanel from './EmailPreviewPanel';

const SOURCE_COLORS = {
  Naukri: { bg: 'rgba(96,165,250,0.08)', color: '#93c5fd' },
  Wellfound: { bg: 'rgba(251,146,60,0.08)', color: '#fdba74' },
  Cutshort: { bg: 'rgba(192,132,252,0.08)', color: '#d8b4fe' },
  Instahyre: { bg: 'rgba(74,222,128,0.08)', color: '#86efac' },
  'IIM Jobs': { bg: 'rgba(248,113,113,0.08)', color: '#fca5a5' },
  'Times Jobs': { bg: 'rgba(250,204,21,0.08)', color: '#fde68a' },
};

const stageOf = (lead) => lead.pipeline_stage || lead.status || 'Found';
const scoreRing = (score) => (score >= 8 ? 'sg' : score >= 5 ? 'sw' : 'sr');
const defaultSubject = 'We have [Role] candidates ready for [Company]';
const defaultBody = 'Hi [FirstName], noticed [Company] is actively building its [Function] team in [City]. At Grape, we have 300 pre-vetted candidates ready to interview. Our AI Tal has already done deep assessments on each of them so you skip straight to the final conversation. Worth a quick look?';

const blurb = (lead) => {
  const days = lead.days_posted || 0;
  const sources = (lead.source_platforms || []).slice(0, 2).join(' and ') || 'multiple sources';
  const urgency = days <= 1
    ? 'Urgent hire.'
    : days <= 3
      ? 'High urgency hire.'
      : days <= 7
        ? 'Actively hiring.'
        : 'Ongoing search.';
  return `Posted ${lead.function} role ${days} days ago on ${sources}. ${urgency}`;
};

const Dashboard = ({
  leads,
  loading,
  searchMessage,
  leadCountLabel,
  currentFilters,
  onSearchDatabase,
  onSearchInternet,
  onManualPull,
  onFilterChange,
  onSendEmail,
  onBulkEmail,
  onBlacklist,
}) => {
  const [selected, setSelected] = useState(new Set());
  const [preview, setPreview] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSubject, setBulkSubject] = useState(defaultSubject);
  const [bulkBody, setBulkBody] = useState(defaultBody);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkSending, setBulkSending] = useState(false);

  const visibleLeads = useMemo(() => {
    const search = String(currentFilters.search || '').trim().toLowerCase();
    return leads
      .filter((lead) => !lead.is_blacklisted)
      .filter((lead) => {
        if (!search) return true;
        return ['name', 'company', 'title', 'city', 'function']
          .some((field) => String(lead[field] || '').toLowerCase().includes(search));
      });
  }, [leads, currentFilters.search]);

  const foundLeads = visibleLeads.filter((lead) => stageOf(lead) === 'Found');
  const sentCount = visibleLeads.filter((lead) => stageOf(lead) === 'Email Sent').length;
  const avgScore = foundLeads.length
    ? Math.round(foundLeads.reduce((sum, lead) => sum + Number(lead.activity_score || 0), 0) / foundLeads.length)
    : 0;

  const selectedLeads = visibleLeads.filter((lead) => selected.has(lead.id));

  const toggle = (lead) => {
    const next = new Set(selected);
    if (next.has(lead.id)) {
      next.delete(lead.id);
      if (preview?.id === lead.id) setPreview(null);
    } else {
      next.add(lead.id);
      setPreview(lead);
    }
    setSelected(next);
  };

  const sendBulk = async () => {
    if (!selectedLeads.length) return;
    setBulkSending(true);
    setBulkProgress(10);
    const ids = selectedLeads.map((lead) => lead.id);
    await onBulkEmail({ leadIds: ids, subject: bulkSubject, body: bulkBody });
    setBulkProgress(100);
    setTimeout(() => {
      setBulkSending(false);
      setBulkOpen(false);
      setSelected(new Set());
      setBulkProgress(0);
    }, 900);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Grape Hiring Manager Engine</h1>
        <p className="page-subtitle">Database-first prospecting for Tal. Scrape only when you explicitly choose Search Internet or Manual Pull.</p>
        <hr className="header-line" />
      </div>

      <div className="stats-row">
        <div className="stat-card sv">
          <div className="stat-label">Total Leads</div>
          <div className="stat-num">{visibleLeads.length}</div>
          <div className="stat-hint">saved in Supabase</div>
        </div>
        <div className="stat-card sc">
          <div className="stat-label">Selected</div>
          <div className="stat-num">{selected.size}</div>
          <div className="stat-hint">ready for outreach</div>
        </div>
        <div className="stat-card sw">
          <div className="stat-label">Average Score</div>
          <div className="stat-num">{avgScore || '—'}</div>
          <div className="stat-hint">activity / 10</div>
        </div>
        <div className="stat-card se">
          <div className="stat-label">Emails Sent</div>
          <div className="stat-num">{sentCount}</div>
          <div className="stat-hint">from pipeline</div>
        </div>
      </div>

      <SearchPanel
        loading={loading}
        leadCountLabel={leadCountLabel}
        onSearchDatabase={onSearchDatabase}
        onSearchInternet={onSearchInternet}
        onManualPull={onManualPull}
        onFilterChange={onFilterChange}
      />

      {searchMessage && <div className="info-banner">{searchMessage}</div>}

      {loading ? (
        <div className="leads-grid">
          {Array.from({ length: 9 }).map((_, idx) => (
            <div key={idx} className="lc skel">
              <div className="lc-band" />
              <div className="lc-body"><div className="sk" style={{ height: 130 }} /></div>
            </div>
          ))}
        </div>
      ) : visibleLeads.length === 0 ? (
        <div className="empty">
          <div className="empty-orb">⬇</div>
          <div className="empty-h">No leads yet</div>
          <div className="empty-s">Pull from the internet to start building your hiring manager database.</div>
          <button className="btn-primary" onClick={() => onSearchInternet(currentFilters)}>Search Internet</button>
        </div>
      ) : (
        <div className="leads-grid">
          {visibleLeads.map((lead, index) => {
            const isSelected = selected.has(lead.id);
            return (
              <div
                key={lead.id}
                className={`lc ${isSelected ? 'sel' : ''}`}
                style={{ animationDelay: `${Math.min(index * 50, 700)}ms` }}
                onClick={() => toggle(lead)}
              >
                <div className="lc-band" />
                <div className="lc-body">
                  <div className="lc-top">
                    <div className={`lc-chk ${isSelected ? 'on' : ''}`} />
                    <div className="src-badges">
                      {(lead.source_platforms || []).map((source) => {
                        const color = SOURCE_COLORS[source] || { bg: 'rgba(255,255,255,0.1)', color: '#d4d4d4' };
                        return (
                          <span key={source} className="src-b" style={{ background: color.bg, color: color.color }}>
                            {source}
                          </span>
                        );
                      })}
                    </div>
                    <div
                      className={`score-ring ${scoreRing(lead.activity_score)}`}
                      title="Scored by recency, source count, and seniority."
                    >
                      {lead.activity_score}
                    </div>
                  </div>

                  <div>
                    <div className="lc-name">{lead.name}</div>
                    <div className="lc-role">{lead.title}</div>
                  </div>

                    <div className="lc-meta">
                      <div className="lc-row co">{lead.company}</div>
                      <div className="lc-row">{lead.city}</div>
                    </div>
                  <div className="lc-blurb">{blurb(lead)}</div>
                </div>
                <div className="lc-foot" onClick={(event) => event.stopPropagation()}>
                  <a href={lead.linkedin_url || '#'} target="_blank" rel="noreferrer" className="btn-li">View LinkedIn</a>
                  <button className={`btn-sel ${isSelected ? 'on' : ''}`} onClick={() => toggle(lead)}>
                    {isSelected ? 'Selected ✓' : 'Select'}
                  </button>
                  <button className="btn-ghost small" onClick={() => onBlacklist(lead.id)}>Blacklist</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected.size > 0 && (
        <div className="floating-bar">
          <span>{selected.size} selected</span>
          <button className="btn-primary" onClick={() => setBulkOpen(true)}>Bulk Send Email</button>
          <button
            className="btn-secondary"
            onClick={() => {
              const header = ['name', 'company', 'email', 'city', 'function', 'score'];
              const rows = selectedLeads.map((lead) => [lead.name, lead.company, lead.email, lead.city, lead.function, lead.activity_score]);
              const csv = [header, ...rows]
                .map((row) => row.map((item) => `"${String(item || '').replaceAll('"', '""')}"`).join(','))
                .join('\n');
              const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'grape-leads.csv';
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export CSV
          </button>
          <button className="btn-secondary" onClick={() => setSelected(new Set())}>Clear Selection</button>
        </div>
      )}

      {bulkOpen && (
        <div className="modal-overlay" onClick={() => !bulkSending && setBulkOpen(false)}>
          <div className="bulk-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Send email to {selectedLeads.length} hiring managers</h2>
            <div className="bulk-grid">
              <div className="bulk-list">
                {selectedLeads.map((lead) => (
                  <div key={lead.id} className="bulk-row">
                    <span>{lead.name}</span>
                    <small>{lead.company}</small>
                    <small>{lead.email}</small>
                  </div>
                ))}
              </div>
              <div className="bulk-editor">
                <label>Subject</label>
                <input value={bulkSubject} onChange={(event) => setBulkSubject(event.target.value)} />
                <label>Body</label>
                <textarea rows={8} value={bulkBody} onChange={(event) => setBulkBody(event.target.value)} />
                <p>Send schedule: 10 emails per hour</p>
              </div>
            </div>
            {bulkSending && (
              <div className="progress-wrap">
                <div className="progress-bar" style={{ width: `${bulkProgress}%` }} />
              </div>
            )}
            <div className="bulk-actions">
              <button className="btn-secondary" onClick={() => setBulkOpen(false)} disabled={bulkSending}>Cancel</button>
              <button className="btn-send" onClick={sendBulk} disabled={bulkSending}>Send All</button>
            </div>
          </div>
        </div>
      )}

      <EmailPreviewPanel
        lead={preview}
        onClose={() => setPreview(null)}
        onEmailSent={async (id) => {
          await onSendEmail(id);
          setSelected((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }}
      />
    </div>
  );
};

export default Dashboard;
