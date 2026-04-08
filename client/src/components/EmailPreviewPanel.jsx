import React, { useState, useEffect } from 'react';
import { API_BASE } from '../App';

const EmailPreviewPanel = ({ lead, onClose, onEmailSent }) => {
  const [sending, setSending] = useState(false);
  const [template, setTemplate] = useState('');

  useEffect(() => {
    if (lead) {
      setTemplate(`Hi ${lead.name},\n\nWe noticed ${lead.company} is actively building out its ${lead.function} team in ${lead.city}. At Grape, we have 300 pre-vetted candidates ready to interview. Our AI Tal has already done deep assessments on each of them so you skip straight to the final conversation.\n\nWorth a quick look?`);
    }
  }, [lead]);

  return (
    <div className={`slide-panel-overlay ${lead ? 'open' : ''}`}>
      <div className="slide-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.5px' }}>Draft Email</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', fontSize: '20px', padding: 0, width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)' }}>✕</button>
        </div>

        {lead && (
          <>
            <div style={{ marginBottom: '20px' }}>
              <span className="input-label">Recipient</span>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)', fontSize: '15px' }}>
                <span style={{ fontWeight: 600, color: 'white' }}>{lead.name}</span> <span style={{ color: 'var(--text-muted)' }}>&lt;{lead.email}&gt;</span>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <span className="input-label">Subject</span>
              <div style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)', fontSize: '15px', fontWeight: 600, color: 'var(--secondary)' }}>
                Candidates for your {lead.function} team at {lead.company}
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <span className="input-label">Message</span>
              <textarea 
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                style={{ 
                  flex: 1, 
                  width: '100%', 
                  background: 'rgba(0,0,0,0.3)', 
                  border: '1px solid var(--glass-border)', 
                  borderRadius: '12px', 
                  padding: '20px', 
                  color: 'var(--text-main)', 
                  fontFamily: 'inherit',
                  fontSize: '15px',
                  lineHeight: '1.6',
                  resize: 'none',
                  outline: 'none',
                  boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.2)'
                }}
              />
            </div>

            <div style={{ marginTop: '32px', display: 'flex', gap: '16px' }}>
              <button className="btn-outline" style={{ flex: 1, borderRadius: '12px' }} onClick={onClose}>Discard</button>
              <button 
                className="btn-primary" 
                style={{ flex: 2, borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }} 
                onClick={async () => {
                  setSending(true);
                  try {
                    const res = await fetch(`${API_BASE}/send-email`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        leadId: lead.id, leadEmail: lead.email, name: lead.name, company: lead.company, jobFunction: lead.function, city: lead.city
                      })
                    });
                    const data = await res.json();
                    if (data.success) {
                      onEmailSent(lead.id);
                    } else alert('Failed to send email');
                  } catch (err) { alert('Error sending email'); } 
                  finally { setSending(false); }
                }} 
                disabled={sending}
              >
                {sending ? 'Sending...' : 'Send with Resend ✨'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default EmailPreviewPanel;
