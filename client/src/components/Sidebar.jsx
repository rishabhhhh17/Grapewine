/* eslint-disable react/prop-types */
const Dot = ({ color = '#525252' }) => (
  <span style={{
    width: 8,
    height: 8,
    borderRadius: 999,
    display: 'inline-block',
    background: color,
    marginRight: 6,
  }}
  />
);

const Sidebar = ({ activeTab, setActiveTab, stats, autoPullEnabled, onAutoPullToggle }) => (
  <aside className="sidebar">
    <div className="sidebar-logo">
      <div className="logo-icon">G</div>
      <span className="logo-text">Grapevine</span>
    </div>

    <div className="sidebar-label">Navigation</div>
    <nav className="sidebar-nav">
      {['Dashboard', 'Pipeline', 'Search History'].map((tab) => (
        <button
          key={tab}
          className={`nav-btn ${activeTab === tab ? 'active' : ''}`}
          onClick={() => setActiveTab(tab)}
        >
          <span>{tab}</span>
        </button>
      ))}
    </nav>

    <div className="sidebar-sep" />
    <div className="sidebar-label">Database Stats</div>
    <div className="sidebar-qs">
      <div className="qs-row"><span className="qs-key">Total</span><span className="qs-val">{stats?.totalLeads ?? 0}</span></div>
      <div className="qs-row"><span className="qs-key">Emailed</span><span className="qs-val">{stats?.emailed ?? 0}</span></div>
      <div className="qs-row"><span className="qs-key">Replied</span><span className="qs-val">{stats?.replied ?? 0}</span></div>
      <div className="qs-row"><span className="qs-key">Onboarded</span><span className="qs-val">{stats?.onboarded ?? 0}</span></div>
      <div className="qs-row">
        <span className="qs-key">Last scrape</span>
        <span className="qs-val">
          <Dot color={stats?.lastScrapeStatus === 'success' ? '#4ADE80' : stats?.lastScrapeStatus ? '#F87171' : '#525252'} />
          {stats?.lastScrapeTime ? new Date(stats.lastScrapeTime).toLocaleString() : 'Never'}
        </span>
      </div>
      <div className="qs-row">
        <span className="qs-key">Auto pull</span>
        <label className="switch">
          <input
            type="checkbox"
            checked={autoPullEnabled}
            onChange={(event) => onAutoPullToggle(event.target.checked)}
          />
          <span className="slider" />
        </label>
      </div>
      <div className="qs-row">
        <span className="qs-key">Mode</span>
        <span className="qs-val">{autoPullEnabled ? 'Monday 9am' : 'Manual only'}</span>
      </div>
    </div>

    <div className="sidebar-foot">
      Grapevine · Hiring Engine
      <br />
      <span style={{ color: 'var(--t3)', fontSize: 10 }}>Powered by Tal AI</span>
    </div>
  </aside>
);

export default Sidebar;
