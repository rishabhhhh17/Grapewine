/* eslint-disable react/prop-types */
import { useMemo } from 'react';

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

const MODE_OPTIONS = [
  { value: 'daily', label: 'Every day at a time you pick' },
  { value: 'monday', label: 'Every Monday (default)' },
  { value: 'wednesday', label: 'Every Wednesday' },
  { value: 'friday', label: 'Every Friday' },
  { value: 'custom_weekly', label: 'Every week on a custom day' },
  { value: 'interval', label: 'Custom interval in hours' },
];

const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const fmt = (value) => new Intl.NumberFormat().format(Number(value || 0));

const Sidebar = ({
  activeTab,
  setActiveTab,
  stats,
  autoPullEnabled,
  onAutoPullToggle,
  autoPullSchedule,
  nextAutoPullAt,
  onAutoPullScheduleChange,
}) => {
  const mode = useMemo(() => {
    if (autoPullSchedule?.type === 'interval') return 'interval';
    if (autoPullSchedule?.type === 'daily') return 'daily';
    if (autoPullSchedule?.dayOfWeek === 1) return 'monday';
    if (autoPullSchedule?.dayOfWeek === 3) return 'wednesday';
    if (autoPullSchedule?.dayOfWeek === 5) return 'friday';
    return 'custom_weekly';
  }, [autoPullSchedule]);

  const timeValue = autoPullSchedule?.time || '09:00';
  const dayOfWeek = Number(autoPullSchedule?.dayOfWeek ?? 1);
  const intervalHours = Number(autoPullSchedule?.intervalHours ?? 24);

  const updateSchedule = (nextMode, patch = {}) => {
    let next = { ...autoPullSchedule, ...patch };
    if (nextMode === 'interval') {
      next = { type: 'interval', intervalHours: intervalHours || 24, time: '09:00', dayOfWeek: 1, ...patch };
    } else if (nextMode === 'daily') {
      next = { type: 'daily', dayOfWeek: 1, time: timeValue, intervalHours: 24, ...patch };
    } else if (nextMode === 'monday') {
      next = { type: 'weekly', dayOfWeek: 1, time: timeValue, intervalHours: 24, ...patch };
    } else if (nextMode === 'wednesday') {
      next = { type: 'weekly', dayOfWeek: 3, time: timeValue, intervalHours: 24, ...patch };
    } else if (nextMode === 'friday') {
      next = { type: 'weekly', dayOfWeek: 5, time: timeValue, intervalHours: 24, ...patch };
    } else {
      next = { type: 'weekly', dayOfWeek, time: timeValue, intervalHours: 24, ...patch };
    }
    onAutoPullScheduleChange(next);
  };

  return (
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
      <div className="qs-row"><span className="qs-key">Total</span><span className="qs-val">{fmt(stats?.totalLeads)}</span></div>
      <div className="qs-row"><span className="qs-key">Emailed</span><span className="qs-val">{fmt(stats?.emailed)}</span></div>
      <div className="qs-row"><span className="qs-key">Replied</span><span className="qs-val">{fmt(stats?.replied)}</span></div>
      <div className="qs-row"><span className="qs-key">Onboarded</span><span className="qs-val">{fmt(stats?.onboarded)}</span></div>
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
      <div className="qs-auto">
        <label className="qs-key" htmlFor="auto-pull-mode">Schedule</label>
        <select
          id="auto-pull-mode"
          className="sidebar-input"
          value={mode}
          onChange={(event) => updateSchedule(event.target.value)}
        >
          {MODE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {(mode !== 'interval') && (
          <input
            type="time"
            className="sidebar-input"
            value={timeValue}
            onChange={(event) => updateSchedule(mode, { time: event.target.value })}
          />
        )}
        {mode === 'custom_weekly' && (
          <select
            className="sidebar-input"
            value={dayOfWeek}
            onChange={(event) => updateSchedule(mode, { dayOfWeek: Number(event.target.value) })}
          >
            {dayName.map((name, idx) => <option key={name} value={idx}>{name}</option>)}
          </select>
        )}
        {mode === 'interval' && (
          <input
            className="sidebar-input"
            type="number"
            min={1}
            max={168}
            value={intervalHours}
            onChange={(event) => updateSchedule(mode, { intervalHours: Number(event.target.value) || 24 })}
          />
        )}
        <div className="qs-next">
          {autoPullEnabled && nextAutoPullAt
            ? `Next run: ${new Date(nextAutoPullAt).toLocaleString()}`
            : 'Next run: Auto pull is off'}
        </div>
      </div>
    </div>

    <div className="sidebar-foot">
      Grapevine · Hiring Engine
      <br />
      <span style={{ color: 'var(--t3)', fontSize: 10 }}>Powered by Tal AI</span>
    </div>
    </aside>
  );
};

export default Sidebar;
