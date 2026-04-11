/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';

const ALL = ['Naukri', 'Wellfound', 'Cutshort', 'Instahyre', 'IIM Jobs', 'Times Jobs'];
const FUNCTIONS = ['Engineering', 'Product', 'Marketing'];
const CITIES = ['Mumbai', 'Delhi', 'Bangalore'];
const STAGES = ['all', 'Found', 'Selected', 'Email Sent', 'Replied', 'Onboarded to Tal'];
const SORT_OPTIONS = [
  { value: 'activity_desc', label: 'Activity score (high to low)' },
  { value: 'activity_asc', label: 'Activity score (low to high)' },
  { value: 'days_asc', label: 'Days posted (newest first)' },
  { value: 'days_desc', label: 'Days posted (oldest first)' },
  { value: 'name_asc', label: 'Name (A to Z)' },
];

const SearchPanel = ({
  loading,
  leadCountLabel,
  onSearchDatabase,
  onSearchInternet,
  onManualPull,
  onFilterChange,
  apiStatus,
}) => {
  const internetEnabled = !apiStatus || apiStatus.firecrawl !== false;
  const internetTitle = internetEnabled ? undefined : 'Add FIRECRAWL_API_KEY to enable internet scraping';
  const [role, setRole] = useState('all');
  const [city, setCity] = useState('all');
  const [strictHiringManager, setStrictHiringManager] = useState(false);
  const [search, setSearch] = useState('');
  const [sources, setSources] = useState(new Set(ALL));
  const [manualOpen, setManualOpen] = useState(false);
  const [manualLogs, setManualLogs] = useState([]);
  const [manualRunning, setManualRunning] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [stageFilter, setStageFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortBy, setSortBy] = useState('activity_desc');
  const [pullCount, setPullCount] = useState(50);

  const selectedSources = useMemo(() => [...sources], [sources]);

  const filters = useMemo(
    () => ({
      role,
      city,
      strictHiringManager,
      search,
      sources: selectedSources,
      stageFilter,
      sourceFilter,
      sortBy,
      pullCount,
    }),
    [role, city, strictHiringManager, search, selectedSources, sourceFilter, sortBy, stageFilter, pullCount]
  );

  const syncFilters = (nextFilters = filters) => {
    onFilterChange?.(nextFilters);
    return nextFilters;
  };

  const toggleSource = (source) => {
    const next = new Set(sources);
    if (next.has(source)) next.delete(source); else next.add(source);
    const finalSet = next.size ? next : new Set(ALL);
    setSources(finalSet);
    syncFilters({ ...filters, sources: [...finalSet] });
  };

  const runManualPull = async () => {
    setManualRunning(true);
    setManualLogs([]);
    try {
      await onManualPull({
        filters,
        onLog: (line) => setManualLogs((prev) => [...prev, line]),
      });
      setTimeout(() => setManualOpen(false), 5000);
    } finally {
      setManualRunning(false);
    }
  };

  return (
    <>
      <div className="search-panel">
        <div className="search-layout">
          <div className="field-grp search-grow">
            <div className="field-lbl">Search your {leadCountLabel}</div>
            <input
              className="search-input"
              value={search}
              onChange={(event) => {
                const next = event.target.value;
                setSearch(next);
                syncFilters({ ...filters, search: next });
              }}
              placeholder={`Search your ${leadCountLabel}`}
            />
          </div>
          <div className="filter-dropdown-wrap">
            <button className="btn-secondary filter-toggle-btn" onClick={() => setFilterMenuOpen((v) => !v)}>
              Filters & Sort ▾
            </button>
            {(role !== 'all' || city !== 'all' || stageFilter !== 'all' || sourceFilter !== 'all' || search) && (
              <button
                className="btn-clear-filters"
                onClick={() => {
                  setRole('all');
                  setCity('all');
                  setStageFilter('all');
                  setSourceFilter('all');
                  setSearch('');
                  setSources(new Set(ALL));
                  const cleared = { ...filters, role: 'all', city: 'all', stageFilter: 'all', sourceFilter: 'all', search: '', sources: [...ALL] };
                  syncFilters(cleared);
                }}
              >
                Clear filters
              </button>
            )}

            <div className={`filter-dropdown ${filterMenuOpen ? 'open' : ''}`}>
              <div className="field-grp">
                <div className="field-lbl">Function</div>
                <select
                  className="search-select"
                  value={role}
                  onChange={(event) => {
                    const next = event.target.value;
                    setRole(next);
                    syncFilters({ ...filters, role: next });
                  }}
                >
                  <option value="all">All functions</option>
                  {FUNCTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="field-grp">
                <div className="field-lbl">City</div>
                <select
                  className="search-select"
                  value={city}
                  onChange={(event) => {
                    const next = event.target.value;
                    setCity(next);
                    syncFilters({ ...filters, city: next });
                  }}
                >
                  <option value="all">All cities</option>
                  {CITIES.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="field-grp">
                <div className="field-lbl">Pipeline stage</div>
                <select
                  className="search-select"
                  value={stageFilter}
                  onChange={(event) => {
                    const next = event.target.value;
                    setStageFilter(next);
                    syncFilters({ ...filters, stageFilter: next });
                  }}
                >
                  {STAGES.map((item) => <option key={item} value={item}>{item === 'all' ? 'All stages' : item}</option>)}
                </select>
              </div>
              <div className="field-grp">
                <div className="field-lbl">Source filter</div>
                <select
                  className="search-select"
                  value={sourceFilter}
                  onChange={(event) => {
                    const next = event.target.value;
                    setSourceFilter(next);
                    syncFilters({ ...filters, sourceFilter: next });
                  }}
                >
                  <option value="all">All sources</option>
                  {ALL.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
              <div className="field-grp">
                <div className="field-lbl">Sort</div>
                <select
                  className="search-select"
                  value={sortBy}
                  onChange={(event) => {
                    const next = event.target.value;
                    setSortBy(next);
                    syncFilters({ ...filters, sortBy: next });
                  }}
                >
                  {SORT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
              <div className="field-grp">
                <div className="field-lbl">Leads per pull</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    className="search-select"
                    type="number"
                    min={10}
                    max={500}
                    step={10}
                    value={pullCount}
                    style={{ width: 80 }}
                    onChange={(event) => {
                      const next = Math.max(10, Math.min(500, Number(event.target.value) || 50));
                      setPullCount(next);
                      syncFilters({ ...filters, pullCount: next });
                    }}
                  />
                  <span style={{ color: 'var(--t3)', fontSize: 12 }}>
                    Fresh pull &amp; DB view limit
                  </span>
                </div>
              </div>
              <div
                className="tog-wrap"
                onClick={() => {
                  const next = !strictHiringManager;
                  setStrictHiringManager(next);
                  syncFilters({ ...filters, strictHiringManager: next });
                }}
              >
                <div className={`tog-track ${strictHiringManager ? 'on' : ''}`}>
                  <div className="tog-thumb" />
                </div>
                <span className="tog-lbl">Managers Only</span>
              </div>
              <div className="sources-row in-dropdown">
                <span className="field-lbl" style={{ margin: 0 }}>Internet sources</span>
                <button
                  className="src-chip"
                  onClick={() => {
                    const allSources = new Set(ALL);
                    setSources(allSources);
                    syncFilters({ ...filters, sources: [...allSources] });
                  }}
                >
                  All
                </button>
                {ALL.map((source) => (
                  <button
                    key={source}
                    className={`src-chip ${sources.has(source) ? 'on' : ''}`}
                    onClick={() => toggleSource(source)}
                  >
                    {source}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="search-actions">
          <button className="btn-primary btn-search-db" onClick={() => onSearchDatabase(syncFilters())} disabled={loading}>
            Search Database
          </button>
          <button
            className="btn-secondary btn-search-internet"
            onClick={() => internetEnabled && onSearchInternet(syncFilters())}
            disabled={loading || !internetEnabled}
            title={internetTitle}
          >
            <span role="img" aria-label="globe">🌐</span> Search Internet
          </button>
          <button
            className="btn-secondary"
            onClick={() => setManualOpen(true)}
            disabled={loading || !internetEnabled}
            title={internetEnabled ? undefined : 'Add FIRECRAWL_API_KEY to enable manual pull'}
          >
            ⬇ Manual Pull
          </button>
        </div>
      </div>

      {manualOpen && (
        <div className="drawer-overlay" onClick={() => !manualRunning && setManualOpen(false)}>
          <div className="manual-drawer" onClick={(event) => event.stopPropagation()}>
            <h3>Manual Pull</h3>
            <p>Select sources and pull now for current filters.</p>
            <div className="source-checks">
              {ALL.map((source) => (
                <label key={source}>
                  <input
                    type="checkbox"
                    checked={sources.has(source)}
                    onChange={() => toggleSource(source)}
                  />
                  <span>{source}</span>
                </label>
              ))}
            </div>
            <button className="btn-primary full" onClick={runManualPull} disabled={manualRunning}>
              {manualRunning ? 'Pulling…' : 'Pull Now'}
            </button>
            <div className="manual-log">
              {manualLogs.length === 0
                ? <p>Live logs will appear here...</p>
                : manualLogs.map((line, idx) => <p key={`${line}-${idx}`}>{line}</p>)
              }
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SearchPanel;
