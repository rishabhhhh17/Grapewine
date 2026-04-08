import React from 'react';

const Header = ({ activeTab, setActiveTab }) => {
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '36px', fontWeight: '700', letterSpacing: '-1px', textShadow: '0 0 20px rgba(255,255,255,0.1)' }}>
            Grape Hiring Manager Engine
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '18px', marginTop: '8px', fontWeight: '300' }}>
            Find active hiring managers for Tal using AI matchmaking.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, var(--primary), var(--secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '24px', boxShadow: '0 10px 30px var(--primary-glow)', border: '1px solid rgba(255,255,255,0.2)' }}>
            G
          </div>
        </div>
      </div>
      
      <div className="header-nav">
        <button 
          className={activeTab === 'Dashboard' ? 'active' : ''} 
          onClick={() => setActiveTab('Dashboard')}
        >
          Dashboard
        </button>
        <button 
          className={activeTab === 'Pipeline' ? 'active' : ''} 
          onClick={() => setActiveTab('Pipeline')}
        >
          Pipeline
        </button>
      </div>
    </div>
  );
};

export default Header;
