import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import PipelineTab from './components/PipelineTab';
import SearchHistoryTab from './components/SearchHistoryTab';
import { supabase } from './lib/supabaseClient';

const API_ROOT = import.meta.env.VITE_API_BASE || 'http://localhost:3000';
export const API_BASE = `${API_ROOT}/api`;

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

    // Strip 'all'/empty values — server treats absence as "no filter"
    const cleanQuery = Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== 'all' && v !== '' && v !== undefined && v !== null)
    );

    while (allLeads.length < requestedLimit) {
      const qs = new URLSearchParams({
        ...cleanQuery,
        page: String(page),
        limit: String(pageSize),
      });
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
      // server unreachable — leave apiStatus null so UI shows unknown state
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

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

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

  useEffect(() => {
    if (!initialized) return undefined;
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
  }, [currentFilters.role, currentFilters.city, currentFilters.search, fetchLeads, initialized]);

  useEffect(() => {
    if (!initialized || !supabase) return undefined;

    let refreshTimer;
    const queueRealtimeRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        const { role, city, search } = currentFiltersRef.current;
        fetchLeads({
          role,
          city,
          search,
          page: 1,
          limit: 5000,
        }).catch((error) => setToast(error.message));
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
  }, [fetchLeads, initialized, refreshStats]);

  const runSearch = async (filters, forceInternet) => {
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

      // After internet search: always re-fetch directly from DB so the
      // lead list is fresh and the total count reflects what was just saved.
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
      await fetchLeads({
        role: filters.role,
        city: filters.city,
        search: filters.search,
        limit: filters.pullCount || 50,
      });
      await Promise.all([refreshStats(), refreshSearchHistory()]);
      setToast(data.message || 'Manual pull complete');
      return data;
    } finally {
      stream.close();
    }
  };

  const sendSingleEmail = async (leadId) => {
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
    const res = await fetch(`${API_BASE}/bulk-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadIds,
        customMessage: { subject, body },
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Bulk queue failed');
    setToast(`Queued ${data.queued} emails (${data.queueRate})`);
    return data;
  };

  const handleStatusChange = async (leadId, stage) => {
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
    await fetch(`${API_BASE}/blacklist`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId }),
    });
    await Promise.all([fetchLeads(currentFilters), refreshStats()]);
  };

  const handleAutoPullToggle = async (enabled) => {
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

  const leadCountLabel = useMemo(() => {
    const total = Number.isFinite(Number(stats?.totalLeads))
      ? Number(stats.totalLeads)
      : leads.length;
    return `${new Intl.NumberFormat().format(total)} saved leads`;
  }, [leads.length, stats?.totalLeads]);

  const modeBanner = (() => {
    if (!apiStatus) return null;
    const allOn = apiStatus.supabase && apiStatus.firecrawl && apiStatus.apify && apiStatus.resend && apiStatus.groq;
    if (allOn) return { text: 'Fully configured. All features active.', cls: 'mode-banner full' };
    const missing = [];
    if (!apiStatus.firecrawl) missing.push('internet scraping');
    if (!apiStatus.resend) missing.push('email sending');
    if (!apiStatus.apify) missing.push('LinkedIn matching');
    if (!apiStatus.groq) missing.push('intent parsing');
    if (missing.length === 0) return null;
    return {
      text: `Running in Database Mode. ${missing.map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(', ')} require${missing.length === 1 ? 's' : ''} API keys.`,
      cls: 'mode-banner partial',
    };
  })();

  return (
    <>
    {modeBanner && <div className={modeBanner.cls}>{modeBanner.text}</div>}
    <div className="app-layout">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stats={stats}
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
            isMockMode={Boolean(stats?.isMock)}
            totalLeads={Number(stats?.totalLeads || 0)}
            selectedCount={Number(stats?.selected || 0)}
            emailedCount={Number(stats?.emailed || 0)}
            leadCountLabel={leadCountLabel}
            currentFilters={currentFilters}
            onSearchDatabase={searchDatabase}
            onSearchInternet={searchInternet}
            onManualPull={runManualPull}
            searchSource={searchMeta.source}
            onFilterChange={setCurrentFilters}
            onSendEmail={sendSingleEmail}
            onBulkEmail={queueBulkEmail}
            onBlacklist={handleBlacklist}
            onStageChange={handleStatusChange}
            apiStatus={apiStatus}
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
