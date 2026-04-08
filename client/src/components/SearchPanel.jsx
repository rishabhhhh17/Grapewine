import React, { useState } from 'react';

const ALL_SOURCES = ['Naukri', 'Wellfound', 'Cutshort', 'Instahyre', 'IIM Jobs', 'Times Jobs'];

const SOURCE_COLORS = {
  'Naukri':    '#3b82f6',
  'Wellfound': '#f97316',
  'Cutshort':  '#a855f7',
  'Instahyre': '#22c55e',
  'IIM Jobs':  '#ef4444',
  'Times Jobs':'#eab308',
};

const SearchPanel = ({ onSearch, loading, onSourceFilterChange }) => {
  const [jobFunction, setJobFunction] = useState('Engineering');
  const [city, setCity] = useState('Bangalore');
  const [strictHiringManager, setStrictHiringManager] = useState(false);
  const [activeFilters, setActiveFilters] = useState(new Set(ALL_SOURCES));

  const functions = ['Engineering', 'Product', 'Marketing'];
  const cities = ['Mumbai', 'Delhi', 'Bangalore'];

  const toggleSource = (source) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(source)) {
        next.delete(source);
      } else {
        next.add(source);
      }
      // Empty or full selection = no filter
      if (next.size === 0 || next.size === ALL_SOURCES.length) {
        const full = new Set(ALL_SOURCES);
        onSourceFilterChange(null);
        return full;
      }
      onSourceFilterChange(next);
      return next;
    });
  };

  const resetFilters = () => {
    setActiveFilters(new Set(ALL_SOURCES));
    onSourceFilterChange(null);
  };

  const allActive = activeFilters.size === ALL_SOURCES.length;

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '28px', marginBottom: '32px' }}>
      {/* Row 1: Function / City / Strict / Search button */}
      <div style={{ display: 'flex', gap: '40px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="input-label">Function</span>
          <div className="toggle-group">
            {functions.map(f => (
              <button
                key={f}
                className={`toggle-btn ${jobFunction === f ? 'active' : ''}`}
                onClick={() => setJobFunction(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="input-label">City</span>
          <div className="toggle-group">
            {cities.map(c => (
              <button
                key={c}
                className={`toggle-btn ${city === c ? 'active' : ''}`}
                onClick={() => setCity(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="input-label">Strict Filter</span>
          <div
            className={`toggle-group ${strictHiringManager ? 'active-strict' : ''}`}
            onClick={() => setStrictHiringManager(!strictHiringManager)}
            style={{
              cursor: 'pointer',
              padding: '12px 24px',
              background: strictHiringManager ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
              border: strictHiringManager ? '1px solid var(--primary)' : '1px solid transparent',
              transition: 'all 0.3s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%',
                background: strictHiringManager ? 'var(--primary)' : 'rgba(255,255,255,0.1)',
                flexShrink: 0, transition: 'all 0.3s',
                boxShadow: strictHiringManager ? '0 0 10px var(--primary)' : 'none'
              }}></div>
              <span style={{ fontWeight: 600, color: strictHiringManager ? 'white' : 'var(--text-muted)' }}>
                Managers Only
              </span>
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }}></div>

        <button
          className="btn-primary"
          style={{ padding: '16px 40px', fontSize: '16px', borderRadius: '16px', height: '52px' }}
          onClick={() => onSearch(jobFunction, city, strictHiringManager)}
          disabled={loading}
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{
                display: 'inline-block', width: '16px', height: '16px',
                border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white',
                borderRadius: '50%', animation: 'spin 1s linear infinite'
              }}></span>
              Searching...
            </span>
          ) : 'Launch Deep Scrape'}
        </button>
      </div>

      {/* Row 2: Platform source filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <span className="input-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Filter by Source</span>

        <button
          onClick={resetFilters}
          style={{
            padding: '6px 16px',
            borderRadius: '100px',
            fontSize: '12px',
            fontWeight: 600,
            border: `1px solid ${allActive ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'}`,
            color: allActive ? 'var(--text-main)' : 'var(--text-muted)',
            background: allActive ? 'rgba(255,255,255,0.08)' : 'transparent',
            transition: 'all 0.2s',
          }}
        >
          All
        </button>

        {ALL_SOURCES.map(source => {
          const color = SOURCE_COLORS[source];
          const isActive = activeFilters.has(source);
          return (
            <button
              key={source}
              onClick={() => toggleSource(source)}
              style={{
                padding: '6px 16px',
                borderRadius: '100px',
                fontSize: '12px',
                fontWeight: 600,
                border: `1px solid ${isActive ? color : 'rgba(255,255,255,0.08)'}`,
                color: isActive ? color : 'var(--text-muted)',
                background: isActive ? `${color}18` : 'transparent',
                transition: 'all 0.2s',
                cursor: 'pointer',
              }}
            >
              {source}
            </button>
          );
        })}
      </div>

      <style jsx="true">{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default SearchPanel;
