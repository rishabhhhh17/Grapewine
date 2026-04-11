import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import PipelineTab from './components/PipelineTab';
import SearchHistoryTab from './components/SearchHistoryTab';
import { supabase } from './lib/supabaseClient';
import {
  MOCK_LEADS,
  MOCK_STATS,
  MOCK_API_STATUS,
  MOCK_SEARCH_HISTORY,
} from './data/mockLeads';

const API_ROOT = import.meta.env.VITE_API_BASE || 'http://localhost:3000';
export const API_BASE = `${API_ROOT}/api`;

// Apply role / city / text filters to an array of leads (used in demo mode)
const applyDemoFilters = (allLeads, filters = {}) => {
  let result = allLeads.filter((l) => !l.is_blacklisted);
  if (filters.role && filters.role !== 'all') {
    result = result.filter((l) =>
      String(l.function || '').toLowerCase().includes(filters.role.toLowerCase())
    );
  }
  if (filters.city && filters.city !== 'all') {
    result = result.filter((l) =>
      String(l.city || '').toLowerCase().includes(filters.city.toLowerCase())
    );
  }
  if (filters.search) {
    const s = filters.search.toLowerCase();
    result = result.filter((l) =>
      ['name', 'company', 'title', 'city', 'function'].some((f) =>
        String(l[f] || '').toLowerCase().includes(s)
      )
    );
  }
  return result;
};

function App() {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [searchMeta, setSearchMeta] = useState({ source: '', added: 0, updated: 0, total: 0 });
  const [lastSearchAction, setLastSearchAction] = useState(null);
  const [toast, setToast] = useState('');
  const [stats, setStats] = useState(null);
  const [apiStatus, setApiStatus] = useState(null);
  const [searchHistory, setSearchHistory] = useState([]);
  const [autoPullEnabled, setAutoPullEnabled] = useState(false);
  const [autoPullSchedule, setAutoPullSchedule] = useState({ type: 'weekly', dayOfWeek: 1, time: '09:00', intervalHours: 24 });
  const [nextAutoPullAt, setNextAutoPullAt] = useState(null);
  const [currentFilters, setCurrentFilters] = useState({
    role: 'all',
    city: 'all',
    strictHiringManager: false,
    sources: ['Naukri', 'Wellfound', 'Cutshort', 'Instahyre', 'IIM Jobs', 'Times Jobs'],
    search: '',
    stageFilter: 'all',
    sourceFilter: 'all',
    sortBy: 'activity_desc',
    pullCount: 50,
  });
  const currentFiltersRef = useRef(currentFilters);

  // Demo mode — persisted in localStorage
  const [isDemoMode, setIsDemoMode] = useState(() => localStorage.getItem('grapeDemo') === 'true');
  // Keep a mutable ref so realtime / filter effects can read it without needing it as a dep
  const isDemoModeRef = useRef(isDemoMode);
  useEffect(() => { isDemoModeRef.current = isDemoMode; }, [isDemoMode]);

  // ── Real-data helpers ────────────────────────────────────────────────────

  const refreshStats = useCallback(async () => {
    const res = await fetch(`${API_BASE}/stats`);
    const data = await res.json();
    if (data.success) {
      setStats(data);
      if (typeof data.autoPullEnabled === 'boolean') setAutoPullEnabled(data.autoPullEnabled);
      if (data.autoPullSchedule) setAutoPullSchedule(data.autoPullSchedule);
      setNextAutoPullAt(data.nextAutoPullAt || null);
    }
  }, []);

  const refreshSearchHistory = useCallback(async () => {
    const res = await fetch(`${API_BASE}/search-history`);
    const data = await res.json();
    if (data.success) setSearchHistory(data.data || []);
  }, []);

  const fetchLeads = useCallback(async (query = {}) => {
    const requestedLimit = Math.max(1, Number(query.limit || 5000));
    const pageSize = Math.min(1000, requestedLimit);
    let page = Math.max(1, Number(query.page || 1));
    let total = 0;
    const allLeads = [];

    const cleanQuery = Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== 'all' && v !== '' && v !== undefined && v !== null)
    );

    while (allLeads.length < requestedLimit) {
      const qs = new URLSearchParams({ ...cleanQuery, page: String(page), limit: String(pageSize) });
      const res = await fetch(`${API_BASE}/leads?${qs.toString()}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load leads');
      const batch = data.leads || [];
      total = Number(data.total || 0);
      allLeads.push(...batch);
      if (batch.length < pageSize) break;
      if (allLeads.length >= total) break;
      page += 1;
    }

    setLeads(allLeads.slice(0, requestedLimit));
    return { success: true, leads: allLeads.slice(0, requestedLimit), total };
  }, []);

  const refreshApiStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      const data = await res.json();
      if (data.services) setApiStatus(data.services);
    } catch {
      // server unreachable — leave null so UI shows unknown state
    }
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    const [leadsResult] = await Promise.allSettled([
      fetchLeads(),
      refreshStats(),
      refreshSearchHistory(),
      refreshApiStatus(),
    ]);
    if (leadsResult.status === 'rejected') {
      setToast(`Failed to load leads: ${leadsResult.reason?.message || 'Network error'}`);
    }
    setInitialized(true);
    setLoading(false);
  }, [fetchLeads, refreshSearchHistory, refreshStats, refreshApiStatus]);

  // ── Boot ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isDemoMode) {
      setLeads([...MOCK_LEADS]);
      setStats({ ...MOCK_STATS });
      setApiStatus({ ...MOCK_API_STATUS });
      setSearchHistory([...MOCK_SEARCH_HISTORY]);
      setAutoPullEnabled(false);
      setInitialized(true);
    } else {
      loadInitial();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Side effects ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    currentFiltersRef.current = currentFilters;
  }, [currentFilters]);

  useEffect(() => {
    if (activeTab === 'Dashboard') return;
    setSearchMessage('');
    setSearchMeta({ source: '', added: 0, updated: 0, total: 0 });
    setLastSearchAction(null);
  }, [activeTab]);

  // Re-fetch when role / city / search filters change (real mode only)
  useEffect(() => {
    if (!initialized || isDemoMode) return undefined;
    const timer = setTimeout(() => {
      fetchLeads({
        role: currentFilters.role,
        city: currentFilters.city,
        search: currentFilters.search,
        page: 1,
        limit: 5000,
      }).catch((error) => setToast(error.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [currentFilters.role, currentFilters.city, currentFilters.search, fetchLeads, initialized, isDemoMode]);

  // Realtime Supabase subscription (real mode only)
  useEffect(() => {
    if (!initialized || !supabase || isDemoMode) return undefined;

    let refreshTimer;
    const queueRealtimeRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        const { role, city, search } = currentFiltersRef.current;
        fetchLeads({ role, city, search, page: 1, limit: 5000 }).catch((error) => setToast(error.message));
        refreshStats().catch((error) => setToast(error.message));
      }, 150);
    };

    const channel = supabase
      .channel('leads-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, queueRealtimeRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'leads' }, queueRealtimeRefresh)
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [fetchLeads, initialized, refreshStats, isDemoMode]);

  // ── Demo mode toggle ──────────────────────────────────────────────────────

  const toggleDemoMode = useCallback(() => {
    const next = !isDemoModeRef.current;
    setIsDemoMode(next);
    isDemoModeRef.current = next;
    localStorage.setItem('grapeDemo', String(next));
    if (next) {
      setLeads([...MOCK_LEADS]);
      setStats({ ...MOCK_STATS });
      setApiStatus({ ...MOCK_API_STATUS });
      setSearchHistory([...MOCK_SEARCH_HISTORY]);
      setSearchMessage('');
      setLastSearchAction(null);
      setSearchMeta({ source: '', added: 0, updated: 0, total: 0 });
    } else {
      loadInitial();
    }
  }, [loadInitial]);

  // ── Search / pull actions ─────────────────────────────────────────────────

  const runSearch = async (filters, forceInternet) => {
    if (isDemoModeRef.current) {
      setToast('Demo Mode: Internet scraping disabled. Exit demo to use real APIs.');
      return;
    }
    setLoading(true);
    setCurrentFilters(filters);
    setLastSearchAction(forceInternet ? 'internet' : 'database');
    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: filters.role === 'all' ? '' : filters.role,
          city: filters.city === 'all' ? '' : filters.city,
          strictHiringManager: filters.strictHiringManager,
          sources: filters.sources,
          search: filters.search,
          forceInternet,
          count: filters.pullCount || 50,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Search failed');

      setSearchMessage(data.message || '');
      setSearchMeta({
        source: data.source || 'database',
        added: Number(data.added || 0),
        updated: Number(data.updated || 0),
        total: Number(data.totalInDatabase || 0),
      });

      await fetchLeads({
        role: filters.role === 'all' ? undefined : filters.role,
        city: filters.city === 'all' ? undefined : filters.city,
        search: filters.search || undefined,
        page: 1,
        limit: filters.pullCount || 50,
      });

      await Promise.all([refreshStats(), refreshSearchHistory()]);
      if (forceInternet) setToast(`${data.added || 0} new leads added to database`);
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoading(false);
    }
  };

  const searchDatabase = async (filters) => {
    if (isDemoModeRef.current) {
      setLoading(true);
      setCurrentFilters(filters);
      setLastSearchAction('database');
      await new Promise((r) => setTimeout(r, 350));
      const filtered = applyDemoFilters(MOCK_LEADS, filters);
      setLeads(filtered);
      setSearchMessage(`Demo: Showing ${filtered.length} of ${MOCK_LEADS.length} mock leads`);
      setSearchMeta({ source: 'database', added: 0, updated: 0, total: MOCK_LEADS.length });
      setLoading(false);
      return;
    }
    setLoading(true);
    setCurrentFilters(filters);
    setLastSearchAction('database');
    try {
      const result = await fetchLeads({
        role: filters.role === 'all' ? undefined : filters.role,
        city: filters.city === 'all' ? undefined : filters.city,
        search: filters.search || undefined,
        page: 1,
        limit: filters.pullCount || 50,
      });
      setSearchMessage(`Database search complete. Showing ${result.leads.length} of ${result.total} lead(s) in Supabase.`);
      setSearchMeta({ source: 'database', added: 0, updated: 0, total: result.total });
      await Promise.all([refreshStats(), refreshSearchHistory()]);
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoading(false);
    }
  };

  const searchInternet = async (filters) => runSearch(filters, true);

  const runManualPull = async ({ filters, onLog }) => {
    if (isDemoModeRef.current) {
      onLog('Demo Mode: Using mock data. Exit demo to use real APIs.');
      await new Promise((r) => setTimeout(r, 800));
      onLog('Demo Mode: Manual pull simulated. No real API calls were made.');
      return {};
    }
    const sessionId = crypto.randomUUID();
    const stream = new EventSource(`${API_BASE}/manual-pull/stream?sessionId=${sessionId}`);
    stream.addEventListener('log', (event) => {
      const payload = JSON.parse(event.data);
      onLog(payload.message || 'Progress update');
    });
    stream.addEventListener('summary', (event) => {
      const payload = JSON.parse(event.data);
      onLog(payload.message || 'Manual pull completed');
    });
    stream.onerror = () => stream.close();

    try {
      const res = await fetch(`${API_BASE}/manual-pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: filters.role,
          city: filters.city,
          strictHiringManager: filters.strictHiringManager,
          sources: filters.sources,
          count: filters.pullCount || 50,
          sessionId,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Manual pull failed');
      await fetchLeads({ role: filters.role, city: filters.city, search: filters.search, limit: filters.pullCount || 50 });
      await Promise.all([refreshStats(), refreshSearchHistory()]);
      setToast(data.message || 'Manual pull complete');
      return data;
    } finally {
      stream.close();
    }
  };

  // ── Email / pipeline actions ──────────────────────────────────────────────

  const sendSingleEmail = async (leadId) => {
    if (isDemoModeRef.current) {
      throw new Error('Demo Mode: Email sending disabled. Exit demo to use real APIs.');
    }
    const res = await fetch(`${API_BASE}/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Single email failed');
    await Promise.all([fetchLeads(currentFilters), refreshStats()]);
  };

  const queueBulkEmail = async ({ leadIds, subject, body }) => {
    if (isDemoModeRef.current) {
      setToast('Demo Mode: Bulk email disabled. Exit demo to use real APIs.');
      return { queued: 0 };
    }
    const res = await fetch(`${API_BASE}/bulk-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadIds, customMessage: { subject, body } }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Bulk queue failed');
    setToast(`Queued ${data.queued} emails (${data.queueRate})`);
    return data;
  };

  const handleStatusChange = async (leadId, stage) => {
    if (isDemoModeRef.current) {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, pipeline_stage: stage, status: stage } : l)));
      return;
    }
    const res = await fetch(`${API_BASE}/pipeline`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, stage }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to update lead stage');
    await Promise.all([fetchLeads(currentFilters), refreshStats()]);
  };

  const handleBlacklist = async (leadId) => {
    if (isDemoModeRef.current) {
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      return;
    }
    await fetch(`${API_BASE}/blacklist`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId }),
    });
    await Promise.all([fetchLeads(currentFilters), refreshStats()]);
  };

  const handleAutoPullToggle = async (enabled) => {
    if (isDemoModeRef.current) { setToast('Demo Mode: Auto pull disabled.'); return; }
    const res = await fetch(`${API_BASE}/auto-pull/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to update auto pull');
    setAutoPullEnabled(enabled);
    if (data.autoPullSchedule) setAutoPullSchedule(data.autoPullSchedule);
    setNextAutoPullAt(data.nextAutoPullAt || null);
    setToast(enabled ? 'Auto pull enabled' : 'Auto pull disabled');
  };

  const handleAutoPullScheduleChange = async (schedule) => {
    if (isDemoModeRef.current) return;
    const res = await fetch(`${API_BASE}/auto-pull/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to update auto pull schedule');
    setAutoPullSchedule(data.autoPullSchedule || schedule);
    if (typeof data.autoPullEnabled === 'boolean') setAutoPullEnabled(data.autoPullEnabled);
    setNextAutoPullAt(data.nextAutoPullAt || null);
    setToast('Auto pull schedule updated');
  };

  // ── Derived values ────────────────────────────────────────────────────────

  const leadCountLabel = useMemo(() => {
    if (isDemoMode) return '1,542 saved leads';
    const total = Number.isFinite(Number(stats?.totalLeads)) ? Number(stats.totalLeads) : leads.length;
    return `${new Intl.NumberFormat().format(total)} saved leads`;
  }, [isDemoMode, leads.length, stats?.totalLeads]);

  const modeBanner = (() => {
    if (isDemoMode) {
      return { text: '⚡ Demo Mode Active — No API credits being used. Using realistic mock data.', cls: 'mode-banner demo' };
    }
    if (!apiStatus) return null;
    const allOn = ['supabase', 'firecrawl', 'apify', 'resend', 'groq'].every(
      (k) => apiStatus[k] === 'connected' || apiStatus[k] === 'ready'
    );
    if (allOn) return { text: 'Fully configured. All features active.', cls: 'mode-banner full' };
    const missing = [];
    if (apiStatus.firecrawl !== 'ready') missing.push('internet scraping');
    if (apiStatus.resend !== 'ready') missing.push('email sending');
    if (apiStatus.apify !== 'ready') missing.push('LinkedIn matching');
    if (apiStatus.groq !== 'ready') missing.push('intent parsing');
    if (missing.length === 0) return null;
    return {
      text: `Running in Database Mode. ${missing.map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(', ')} require${missing.length === 1 ? 's' : ''} API keys.`,
      cls: 'mode-banner partial',
    };
  })();

  return (
    <>
      {modeBanner && <div className={modeBanner.cls}>{modeBanner.text}</div>}
      <button
        className={`demo-toggle-btn ${isDemoMode ? 'demo-on' : ''}`}
        onClick={toggleDemoMode}
        title={isDemoMode ? 'Exit demo — switch to live data' : 'Enter demo mode — no API keys needed'}
      >
        {isDemoMode ? '⏹ Exit Demo' : '▶ Demo Mode'}
      </button>
      <div className="app-layout">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          stats={isDemoMode ? MOCK_STATS : stats}
          autoPullEnabled={autoPullEnabled}
          onAutoPullToggle={handleAutoPullToggle}
          autoPullSchedule={autoPullSchedule}
          nextAutoPullAt={nextAutoPullAt}
          onAutoPullScheduleChange={handleAutoPullScheduleChange}
          apiStatus={apiStatus}
        />
        <main className="main-content">
          {activeTab === 'Dashboard' && (
            <Dashboard
              leads={leads}
              loading={loading}
              searchMessage={searchMessage}
              searchMeta={searchMeta}
              lastSearchAction={lastSearchAction}
              isMockMode={isDemoMode || Boolean(stats?.isMock)}
              totalLeads={isDemoMode ? MOCK_STATS.totalLeads : Number(stats?.totalLeads || 0)}
              selectedCount={isDemoMode ? MOCK_STATS.selected : Number(stats?.selected || 0)}
              emailedCount={isDemoMode ? MOCK_STATS.emailed : Number(stats?.emailed || 0)}
              leadCountLabel={leadCountLabel}
              currentFilters={currentFilters}
              onSearchDatabase={searchDatabase}
              onSearchInternet={searchInternet}
              onManualPull={runManualPull}
              onFilterChange={setCurrentFilters}
              onSendEmail={sendSingleEmail}
              onBulkEmail={queueBulkEmail}
              onBlacklist={handleBlacklist}
              onStageChange={handleStatusChange}
              apiStatus={apiStatus}
              isDemoMode={isDemoMode}
            />
          )}
          {activeTab === 'Pipeline' && (
            <PipelineTab leads={leads} onStatusChange={handleStatusChange} />
          )}
          {activeTab === 'Search History' && (
            <SearchHistoryTab
              history={searchHistory}
              onApply={async (entry) => {
                await fetchLeads({
                  role: entry.role || 'Engineering',
                  city: entry.city || 'Bangalore',
                });
                setActiveTab('Dashboard');
              }}
            />
          )}
        </main>
        {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}

export default App;
