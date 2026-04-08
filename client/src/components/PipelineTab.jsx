import React from 'react';

const PipelineTab = ({ leads, onStatusChange }) => {
  const columns = ['Found', 'Selected', 'Email Sent', 'Replied', 'Onboarded to Tal'];

  const getLeadsByStatus = (status) => {
    return leads.filter(l => l.status === status || (status === 'Found' && !l.status));
  };

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '32px', fontWeight: 700, fontFamily: 'Outfit', letterSpacing: '-0.5px' }}>Pipeline View</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '16px', marginTop: '8px' }}>
          Track hiring manager engagement across all stages.
        </p>
      </div>

      <div className="pipeline-board">
        {columns.map(col => {
          const colLeads = getLeadsByStatus(col);
          return (
            <div key={col} className="pipeline-col">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {col}
                </h3>
                <span style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border-highlight)', padding: '2px 10px', borderRadius: '12px', fontSize: '12px', color: 'var(--text-main)', fontWeight: '600' }}>
                  {colLeads.length}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', minHeight: '400px' }}>
                {colLeads.map(lead => (
                  <div key={lead.id} className="card">
                    <div style={{ fontWeight: 600, fontSize: '16px', color: 'white', marginBottom: '6px' }}>
                      {lead.name}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--secondary)', marginBottom: '8px', fontWeight: 500 }}>
                      {lead.title}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{lead.company}</span>
                      <span className="badge" style={{ padding: '2px 8px', fontSize: '11px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>Score: {lead.activity_score}</span>
                    </div>

                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between' }}>
                      <select 
                        value={lead.status || 'Found'} 
                        onChange={(e) => onStatusChange(lead.id, e.target.value)}
                        style={{
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid var(--glass-border)',
                          color: 'var(--text-main)',
                          borderRadius: '8px',
                          padding: '6px 10px',
                          fontSize: '12px',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        {columns.map(c => <option key={c} value={c} style={{ background: 'var(--bg-dark)' }}>{c}</option>)}
                      </select>
                      
                      <a href={lead.linkedin_url} target="_blank" rel="noreferrer" style={{ fontSize: '12px', color: 'var(--primary)', textDecoration: 'none', fontWeight: 600, background: 'rgba(99,102,241,0.1)', padding: '4px 8px', borderRadius: '6px' }}>
                        Profile ↗
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PipelineTab;
