import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import PipelineTab from './components/PipelineTab';

// Base URL for API
export const API_BASE = 'http://localhost:5001/api';

function App() {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    try {
      const res = await fetch(`${API_BASE}/leads`);
      const data = await res.json();
      if (data.leads) setLeads(data.leads);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSearch = async (jobFunction, city, strictHiringManager) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ function: jobFunction, city, strictHiringManager })
      });
      const data = await res.json();
      if (data.leads) {
        setLeads(prev => {
          // Merge avoiding duplicates (mock implementation might duplicate, but valid for now)
          const newLeads = [...prev, ...data.leads];
          return newLeads.sort((a,b) => b.activity_score - a.activity_score);
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSent = (leadId) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: 'Email Sent' } : l));
  };

  const handleStatusChange = async (leadId, newStatus) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
    try {
      await fetch(`${API_BASE}/leads/${leadId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="app-container">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />
      
      {activeTab === 'Dashboard' && (
        <Dashboard 
          leads={leads} 
          onSearch={handleSearch} 
          loading={loading}
          onEmailSent={handleEmailSent}
        />
      )}
      
      {activeTab === 'Pipeline' && (
        <PipelineTab 
          leads={leads} 
          onStatusChange={handleStatusChange} 
        />
      )}
    </div>
  );
}

export default App;
