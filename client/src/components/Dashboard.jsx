import React, { useState } from 'react';
import SearchPanel from './SearchPanel';
import EmailPreviewPanel from './EmailPreviewPanel';

const Dashboard = ({ leads, onSearch, loading, onEmailSent }) => {
  const [selectedLeads, setSelectedLeads] = useState(new Set());
  const [previewLead, setPreviewLead] = useState(null);
  const [allowedSources, setAllowedSources] = useState(null);

  // If a lead has any overlapping source with the allowedSources set, we show it
  // If allowedSources is null, it means no filter has initialized yet (so show all)
  const foundLeads = leads.filter(l => {
    if (l.status !== 'Found' && l.status) return false;
    if (allowedSources !== null && l.sources) {
      if (!l.sources.some(s => allowedSources.has(s))) return false;
    }
    return true;
  });

  const toggleLead = (id, lead) => {
    const newKeys = new Set(selectedLeads);
    if (newKeys.has(id)) {
      newKeys.delete(id);
      if (previewLead?.id === id) setPreviewLead(null);
    } else {
      newKeys.add(id);
      setPreviewLead(lead);
    }
    setSelectedLeads(newKeys);
  };

  const autoSelect100 = () => {
    const newKeys = new Set();
    foundLeads.slice(0, 100).forEach(l => newKeys.add(l.id));
    setSelectedLeads(newKeys);
    if (foundLeads.length > 0) setPreviewLead(foundLeads[0]);
  };

  const getScoreBadge = (score) => {
    if (score >= 8) return <span className="badge green">{score}/10 Activity</span>;
    if (score >= 5) return <span className="badge yellow">{score}/10 Activity</span>;
    return <span className="badge red">{score}/10 Activity</span>;
  };

  const getSourceColor = (source) => {
    const colors = {
      'Naukri': '#3b82f6',
      'Wellfound': '#f97316',
      'Cutshort': '#a855f7',
      'Instahyre': '#22c55e',
      'IIM Jobs': '#ef4444',
      'Times Jobs': '#eab308'
    };
    return colors[source] || '#ffffff';
  };

  return (
    <div style={{ position: 'relative' }}>
      <SearchPanel 
        onSearch={onSearch} 
        loading={loading} 
        onSourceFilterChange={(set) => setAllowedSources(set)} 
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '32px' }}>
          <div>
            <span className="input-label">Total Leads</span>
            <span style={{ fontWeight: '700', fontSize: '32px', fontFamily: 'Outfit, sans-serif' }}>{foundLeads.length}</span>
          </div>
          <div>
            <span className="input-label">Selected</span>
            <span style={{ fontWeight: '700', fontSize: '32px', fontFamily: 'Outfit, sans-serif', color: 'var(--secondary)' }}>{selectedLeads.size}</span>
          </div>
        </div>
        
        <button className="btn-outline" onClick={autoSelect100} style={{ borderRadius: '12px' }}>
          Auto Select Top 100
        </button>
      </div>

      <div className="panel" style={{ padding: '0 0 16px 0', overflow: 'hidden' }}>
        <table>
          <thead style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(10px)' }}>
            <tr>
              <th style={{ width: '60px', paddingLeft: '32px' }}></th>
              <th>Name</th>
              <th>Title</th>
              <th>Company</th>
              <th>Sources</th>
              <th style={{ textAlign: 'center' }}>Days Posted</th>
              <th>Activity Score</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {foundLeads.map((lead) => (
              <tr key={lead.id} className={selectedLeads.has(lead.id) ? 'selected' : ''}>
                <td style={{ paddingLeft: '32px' }}>
                  <label className="checkbox-container">
                    <input 
                      type="checkbox" 
                      checked={selectedLeads.has(lead.id)}
                      onChange={() => toggleLead(lead.id, lead)}
                    />
                    <span className="checkmark"></span>
                  </label>
                </td>
                <td style={{ fontWeight: '600', color: 'white' }}>{lead.name}</td>
                <td style={{ color: 'var(--text-muted)' }}>{lead.title}</td>
                <td style={{ fontWeight: '600', color: 'var(--secondary)' }}>{lead.company}</td>
                <td>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {lead.sources && lead.sources.map(s => (
                      <span key={s} style={{ 
                        fontSize: '11px', 
                        padding: '2px 8px', 
                        borderRadius: '12px', 
                        border: `1px solid ${getSourceColor(s)}`, 
                        color: getSourceColor(s),
                        background: `${getSourceColor(s)}15`
                      }}>
                        {s}
                      </span>
                    ))}
                  </div>
                </td>
                <td style={{ textAlign: 'center', fontWeight: '500', fontFamily: 'Outfit' }}>{lead.days_posted}</td>
                <td>{getScoreBadge(lead.activity_score)}</td>
                <td>
                  <a 
                    href={lead.linkedin_url} 
                    target="_blank" 
                    rel="noreferrer"
                    style={{ 
                      color: 'var(--text-main)', 
                      textDecoration: 'none', 
                      background: 'rgba(255,255,255,0.05)', 
                      border: '1px solid var(--glass-border)',
                      padding: '8px 16px', 
                      borderRadius: '8px', 
                      fontSize: '13px', 
                      fontWeight: 600,
                      display: 'inline-block',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'rgba(255,255,255,0.1)';
                      e.target.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'rgba(255,255,255,0.05)';
                      e.target.style.transform = 'translateY(0)';
                    }}
                  >
                    View LinkedIn ↗
                  </a>
                </td>
              </tr>
            ))}
            {foundLeads.length === 0 && !loading && (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '60px 40px', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.2 }}>🔍</div>
                  <div style={{ fontSize: '18px', fontWeight: 500, fontFamily: 'Outfit' }}>No leads found</div>
                  <div style={{ marginTop: '8px' }}>Adjust your filters and hit 'Launch Real-time Search'.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EmailPreviewPanel 
        lead={previewLead} 
        onClose={() => setPreviewLead(null)} 
        onEmailSent={(id) => {
          onEmailSent(id);
          const newKeys = new Set(selectedLeads);
          newKeys.delete(id);
          setSelectedLeads(newKeys);
          setPreviewLead(null);
        }}
      />
    </div>
  );
};

export default Dashboard;
