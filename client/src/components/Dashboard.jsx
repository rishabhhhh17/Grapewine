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
const scoreRing = (score) => {
  const s = Number(score || 0);
  return s >= 8 ? 'sg' : s >= 5 ? 'sw' : 'sr';
};
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
  searchMeta,
  lastSearchAction,
  isMockMode,
  totalLeads,
  selectedCount,
  emailedCount,
  averageScore: apiAverageScore,
  leadCountLabel,
  currentFilters,
  onSearchDatabase,
  onSearchInternet,
  onManualPull,
  onFilterChange,
  onSendEmail,
  onBulkEmail,
  onBlacklist,
  onStageChange,
  apiStatus,
  isDemoMode,
}) => {
  const [selected, setSelected] = useState(new Set());
  const [preview, setPreview] = useState(null);
  const [viewMode, setViewMode] = useState('card');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSubject, setBulkSubject] = useState(defaultSubject);
  const [bulkBody, setBulkBody] = useState(defaultBody);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkSending, setBulkSending] = useState(false);

  const visibleLeads = useMemo(() => {
    const search = String(currentFilters.search || '').trim().toLowerCase();
    const stageFilter = String(currentFilters.stageFilter || 'all');
    const sourceFilter = String(currentFilters.sourceFilter || 'all');
    const sortBy = String(currentFilters.sortBy || 'activity_desc');

    const sorters = {
      activity_desc: (a, b) => Number(b.activity_score || 0) - Number(a.activity_score || 0),
      activity_asc: (a, b) => Number(a.activity_score || 0) - Number(b.activity_score || 0),
      days_desc: (a, b) => Number(b.days_posted || 0) - Number(a.days_posted || 0),
      days_asc: (a, b) => Number(a.days_posted || 0) - Number(b.days_posted || 0),
      name_asc: (a, b) => String(a.name || '').localeCompare(String(b.name || '')),
    };

    return leads
      .filter((lead) => !lead.is_blacklisted)
      .filter((lead) => (stageFilter === 'all' ? true : stageOf(lead) === stageFilter))
      .filter((lead) => {
        if (sourceFilter === 'all') return true;
        return (lead.source_platforms || []).includes(sourceFilter);
      })
      .filter((lead) => {
        if (!search) return true;
        return ['name', 'company', 'title', 'city', 'function']
          .some((field) => String(lead[field] || '').toLowerCase().includes(search));
      })
      .sort(sorters[sortBy] || sorters.activity_desc);
  }, [leads, currentFilters.search, currentFilters.sourceFilter, currentFilters.sortBy, currentFilters.stageFilter]);

  const foundLeads = visibleLeads.filter((lead) => stageOf(lead) === 'Found');
  const avgScore = foundLeads.length
    ? Math.round(foundLeads.reduce((sum, lead) => sum + Number(lead.activity_score || 0), 0) / foundLeads.length)
    : 0;

  const selectedLeads = visibleLeads.filter((lead) => selected.has(lead.id));
  const selectedVisibleCount = selectedLeads.length;
  const allVisibleSelected = visibleLeads.length > 0 && selectedVisibleCount === visibleLeads.length;

  const toggleSelectionOnly = (lead) => {
    const next = new Set(selected);
    if (next.has(lead.id)) {
      next.delete(lead.id);
      if (preview?.id === lead.id) setPreview(null);
    } else {
      next.add(lead.id);
    }
    setSelected(next);
  };

  const toggleSelectAllVisible = () => {
    const next = new Set(selected);
    if (allVisibleSelected) {
      visibleLeads.forEach((lead) => next.delete(lead.id));
    } else {
      visibleLeads.forEach((lead) => next.add(lead.id));
    }
    setSelected(next);
  };

  const selectLead = async (lead) => {
    if (stageOf(lead) !== 'Selected') {
      await onStageChange(lead.id, 'Selected');
    }
    setSelected((prev) => new Set(prev).add(lead.id));
    setPreview(lead);
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
        <h1 className="page-title">
          Grape Hiring Manager Engine
          {isMockMode && <span className="mock-badge">Mock Mode</span>}
        </h1>
        <p className="page-subtitle">Database-first prospecting for Tal. Scrape only when you explicitly choose Search Internet or Manual Pull.</p>
        <hr className="header-line" />
      </div>

      <div className="stats-row">
        <div className="stat-card sv">
          <div className="stat-label">Total Leads</div>
          <div className="stat-num">{new Intl.NumberFormat().format(totalLeads || 0)}</div>
          <div className="stat-hint">saved in Supabase</div>
        </div>
        <div className="stat-card sc">
          <div className="stat-label">Selected</div>
          <div className="stat-num">{Number(selectedCount || 0)}</div>
          <div className="stat-hint">in pipeline</div>
        </div>
        <div className="stat-card sw">
          <div className="stat-label">Average Score</div>
          <div className="stat-num">{apiAverageScore || avgScore || '—'}</div>
          <div className="stat-hint">activity / 10</div>
        </div>
        <div className="stat-card se">
          <div className="stat-label">Emails Sent</div>
          <div className="stat-num">{emailedCount}</div>
          <div className="stat-hint">real emails logged</div>
        </div>
      </div>

      <SearchPanel
        loading={loading}
        leadCountLabel={leadCountLabel}
        onSearchDatabase={onSearchDatabase}
        onSearchInternet={onSearchInternet}
        onManualPull={onManualPull}
        onFilterChange={onFilterChange}
        apiStatus={apiStatus}
      />

      <div className="filter-match-count">
        Showing {new Intl.NumberFormat().format(visibleLeads.length)} of {new Intl.NumberFormat().format(totalLeads || 0)} leads
      </div>

      {(lastSearchAction === 'database' || (lastSearchAction === 'internet' && searchMeta?.source?.includes('internet'))) && (
        <div className={`result-source-banner ${searchMeta?.source?.startsWith('internet') ? 'internet' : 'database'}`}>
          <span className="result-source-dot" />
          <span>
            {searchMeta?.source?.startsWith('internet')
              ? `🌐 Fresh from internet. ${searchMeta?.added || 0} new leads saved to your database. ${searchMeta?.updated || 0} already existed and were updated.`
              : `🗄️ Showing ${visibleLeads.length} loaded leads (total saved: ${new Intl.NumberFormat().format(totalLeads || 0)})`}
          </span>
        </div>
      )}
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
          <div className="empty-s">
            {searchMeta?.source === 'database'
              ? 'No results in your database for this search. Click Search Internet to find new leads online.'
              : 'Pull from the internet to start building your hiring manager database.'}
          </div>
          <button className="btn-primary" onClick={() => onSearchInternet(currentFilters)}>Search Internet</button>
        </div>
      ) : (
        <>
          <div className="bulk-select-row">
            <label className="bulk-select-check">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
              <span>Select all visible ({visibleLeads.length})</span>
            </label>
            <div className="view-toggle">
              <button
                className={`view-btn ${viewMode === 'card' ? 'active' : ''}`}
                onClick={() => setViewMode('card')}
                title="Card view"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/>
                  <rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>
                </svg>
              </button>
              <button
                className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="List view"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/>
                  <rect x="1" y="12" width="14" height="2" rx="1"/>
                </svg>
              </button>
            </div>
          </div>

          {viewMode === 'card' ? (
            <div className="leads-grid">
              {visibleLeads.map((lead, index) => {
                const isSelected = selected.has(lead.id);
                return (
                  <div
                    key={lead.id}
                    className={`lc ${isSelected ? 'sel' : ''}`}
                    style={{ animationDelay: `${Math.min(index * 50, 700)}ms` }}
                    onClick={() => setPreview(lead)}
                  >
                    <div className="lc-band" />
                    <div className="lc-body">
                      <div className="lc-top">
                        <label className="lead-select-check" onClick={(event) => event.stopPropagation()}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelectionOnly(lead)} />
                        </label>
                        <div className="src-badges">
                          {(lead.source_platforms || []).map((source) => {
                            const color = SOURCE_COLORS[source] || { bg: 'rgba(255,255,255,0.1)', color: '#d4d4d4' };
                            return (
                              <span key={source} className="src-b" style={{ background: color.bg, color: color.color }}>{source}</span>
                            );
                          })}
                        </div>
                        <div className={`score-ring ${scoreRing(lead.activity_score)}`} title="Activity score">{lead.activity_score}</div>
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
                      <a href={lead.linkedin_url || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${lead.name} ${lead.company}`)}`} target="_blank" rel="noreferrer" className="btn-li">View LinkedIn</a>
                      <button className={`btn-sel ${isSelected ? 'on' : ''}`} onClick={async () => { await selectLead(lead); }}>Email</button>
                      <button className="btn-ghost small" onClick={() => onBlacklist(lead.id)}>Blacklist</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="leads-list">
              <div className="ll-header">
                <div className="ll-col chk" />
                <div className="ll-col name">Name</div>
                <div className="ll-col title">Title</div>
                <div className="ll-col company">Company</div>
                <div className="ll-col city">City</div>
                <div className="ll-col fn">Function</div>
                <div className="ll-col score">Score</div>
                <div className="ll-col sources">Sources</div>
                <div className="ll-col actions" />
              </div>
              {visibleLeads.map((lead) => {
                const isSelected = selected.has(lead.id);
                return (
                  <div
                    key={lead.id}
                    className={`ll-row ${isSelected ? 'sel' : ''}`}
                    onClick={() => setPreview(lead)}
                  >
                    <div className="ll-col chk" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleSelectionOnly(lead)} />
                    </div>
                    <div className="ll-col name">
                      <span className="ll-name">{lead.name}</span>
                    </div>
                    <div className="ll-col title ll-muted">{lead.title}</div>
                    <div className="ll-col company ll-green">{lead.company}</div>
                    <div className="ll-col city ll-muted">{lead.city}</div>
                    <div className="ll-col fn ll-muted">{lead.function}</div>
                    <div className="ll-col score">
                      <span className={`score-ring small ${scoreRing(lead.activity_score)}`}>{lead.activity_score}</span>
                    </div>
                    <div className="ll-col sources">
                      {(lead.source_platforms || []).slice(0, 2).map((source) => {
                        const color = SOURCE_COLORS[source] || { bg: 'rgba(255,255,255,0.1)', color: '#d4d4d4' };
                        return <span key={source} className="src-b" style={{ background: color.bg, color: color.color }}>{source}</span>;
                      })}
                    </div>
                    <div className="ll-col actions" onClick={(e) => e.stopPropagation()}>
                      <a href={lead.linkedin_url || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${lead.name} ${lead.company}`)}`} target="_blank" rel="noreferrer" className="btn-li">LinkedIn</a>
                      <button className={`btn-sel ${isSelected ? 'on' : ''}`} onClick={async () => { await selectLead(lead); }}>Email</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
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
                <p>Use [FirstName], [Company], [Role], [Function], [City] to personalize each recipient automatically.</p>
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
        apiStatus={apiStatus}
        isDemoMode={isDemoMode}
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
