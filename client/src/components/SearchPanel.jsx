/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react';

const ALL = ['Naukri', 'Wellfound', 'Cutshort', 'Instahyre', 'IIM Jobs', 'Times Jobs'];
const FUNCTIONS = ['Engineering', 'Product', 'Marketing'];
const CITIES = ['Mumbai', 'Delhi', 'Bangalore'];

const SearchPanel = ({
  loading,
  leadCountLabel,
  onSearchDatabase,
  onSearchInternet,
  onManualPull,
  onFilterChange,
}) => {
  const [role, setRole] = useState('Engineering');
  const [city, setCity] = useState('Bangalore');
  const [strictHiringManager, setStrictHiringManager] = useState(false);
  const [search, setSearch] = useState('');
  const [sources, setSources] = useState(new Set(ALL));
  const [manualOpen, setManualOpen] = useState(false);
  const [manualLogs, setManualLogs] = useState([]);
  const [manualRunning, setManualRunning] = useState(false);

  const selectedSources = useMemo(() => [...sources], [sources]);

  const filters = useMemo(
    () => ({ role, city, strictHiringManager, search, sources: selectedSources }),
    [role, city, strictHiringManager, search, selectedSources]
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
        <div className="search-row">
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
              placeholder="Search name, company, title, city, function"
            />
          </div>

          <div className="field-grp">
            <div className="field-lbl">Function</div>
            <div className="pill-row">
              {FUNCTIONS.map((item) => (
                <button
                  key={item}
                  className={`pill ${role === item ? 'pv' : ''}`}
                  onClick={() => {
                    setRole(item);
                    syncFilters({ ...filters, role: item });
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="field-grp">
            <div className="field-lbl">City</div>
            <div className="pill-row">
              {CITIES.map((item) => (
                <button
                  key={item}
                  className={`pill ${city === item ? 'pc' : ''}`}
                  onClick={() => {
                    setCity(item);
                    syncFilters({ ...filters, city: item });
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="field-grp">
            <div className="field-lbl">Filter</div>
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
          </div>
        </div>

        <div className="sources-row">
          <span className="field-lbl" style={{ margin: 0 }}>Sources</span>
          <button className="src-chip" onClick={() => setSources(new Set(ALL))}>All</button>
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

        <div className="search-actions">
          <button className="btn-primary" onClick={() => onSearchDatabase(syncFilters())} disabled={loading}>
            Search Database
          </button>
          <button className="btn-secondary" onClick={() => onSearchInternet(syncFilters())} disabled={loading}>
            🌐 Search Internet
          </button>
          <button className="btn-secondary" onClick={() => setManualOpen(true)} disabled={loading}>
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
