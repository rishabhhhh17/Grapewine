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
  const [toast, setToast] = useState('');
  const [stats, setStats] = useState(null);
  const [searchHistory, setSearchHistory] = useState([]);
  const [autoPullEnabled, setAutoPullEnabled] = useState(false);
  const [currentFilters, setCurrentFilters] = useState({
    role: 'Engineering',
    city: 'Bangalore',
    strictHiringManager: false,
    sources: ['Naukri', 'Wellfound', 'Cutshort', 'Instahyre', 'IIM Jobs', 'Times Jobs'],
    search: '',
  });
  const currentFiltersRef = useRef(currentFilters);

  const refreshStats = useCallback(async () => {
    const res = await fetch(`${API_BASE}/stats`);
    const data = await res.json();
    if (data.success) {
      setStats(data);
      if (typeof data.autoPullEnabled === 'boolean') setAutoPullEnabled(data.autoPullEnabled);
    }
  }, []);

  const refreshSearchHistory = useCallback(async () => {
    const res = await fetch(`${API_BASE}/search-history`);
    const data = await res.json();
    if (data.success) setSearchHistory(data.data || []);
  }, []);

  const fetchLeads = useCallback(async (query = {}) => {
    const qs = new URLSearchParams(query);
    const res = await fetch(`${API_BASE}/leads?${qs.toString()}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Failed to load leads');
    setLeads(data.leads || []);
    return data;
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchLeads(), refreshStats(), refreshSearchHistory()]);
      setInitialized(true);
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoading(false);
    }
  }, [fetchLeads, refreshSearchHistory, refreshStats]);

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
    if (!initialized) return undefined;
    const timer = setTimeout(() => {
      fetchLeads({
        role: currentFilters.role,
        city: currentFilters.city,
        search: currentFilters.search,
        page: 1,
        limit: 500,
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
          limit: 500,
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
    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: filters.role,
          city: filters.city,
          strictHiringManager: filters.strictHiringManager,
          sources: filters.sources,
          search: filters.search,
          forceInternet,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Search failed');
      setLeads(data.data || []);
      setSearchMessage(data.message || '');
      await Promise.all([refreshStats(), refreshSearchHistory()]);
      if (forceInternet) setToast(data.message || 'Internet pull completed');
    } catch (error) {
      setToast(error.message);
    } finally {
      setLoading(false);
    }
  };

  const searchDatabase = async (filters) => runSearch(filters, false);
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
          sessionId,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Manual pull failed');
      await fetchLeads({
        role: filters.role,
        city: filters.city,
        search: filters.search,
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
    await fetch(`${API_BASE}/pipeline`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId, stage }),
    });
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
    setToast(enabled ? 'Auto pull enabled' : 'Auto pull disabled');
  };

  const leadCountLabel = useMemo(() => {
    const total = Number.isFinite(Number(stats?.totalLeads))
      ? Number(stats.totalLeads)
      : leads.length;
    return `${total}+ saved leads`;
  }, [leads.length, stats?.totalLeads]);

  return (
    <div className="app-layout">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stats={stats}
        autoPullEnabled={autoPullEnabled}
        onAutoPullToggle={handleAutoPullToggle}
      />
      <main className="main-content">
        {activeTab === 'Dashboard' && (
          <Dashboard
            leads={leads}
            loading={loading}
            searchMessage={searchMessage}
            leadCountLabel={leadCountLabel}
            currentFilters={currentFilters}
            onSearchDatabase={searchDatabase}
            onSearchInternet={searchInternet}
            onManualPull={runManualPull}
            onFilterChange={setCurrentFilters}
            onSendEmail={sendSingleEmail}
            onBulkEmail={queueBulkEmail}
            onBlacklist={handleBlacklist}
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
  );
}

export default App;
