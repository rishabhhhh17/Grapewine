/* eslint-disable react/prop-types */
import { useEffect, useState } from 'react';

const EmailPreviewPanel = ({ lead, onClose, onEmailSent, apiStatus }) => {
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState('');
  const [copied, setCopied] = useState(false);
  const [sendStatus, setSendStatus] = useState(null); // 'ok' | 'error' | null
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    if (!lead) return;
    setSendStatus(null);
    setSendError('');
    const firstName = String(lead.name || '').split(' ')[0] || 'there';
    const fn = lead.function || 'Engineering';
    const city = lead.city || 'India';
    const company = lead.company || 'your company';
    setBody(
      `Hi ${firstName}, noticed ${company} is actively building its ${fn} team in ${city}. At Grape, we have 300 pre-vetted candidates ready to interview. Our AI Tal has already done deep assessments on each of them so you skip straight to the final conversation. Worth a quick look?`
    );
  }, [lead]);

  const send = async () => {
    if (!lead || sending) return;
    setSending(true);
    setSendStatus(null);
    setSendError('');
    try {
      await onEmailSent(lead.id);
      setSendStatus('ok');
      setTimeout(() => onClose(), 1200);
    } catch (err) {
      setSendStatus('error');
      setSendError(err?.message || 'Send failed — check server logs.');
    } finally {
      setSending(false);
    }
  };

  const copy = async () => {
    if (!body) return;
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const handleOverlayClick = (event) => {
    if (sending) return; // block close while sending
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div className={`overlay ${lead ? 'open' : ''}`} onClick={handleOverlayClick}>
      <div className="ep">
        <div className="ep-band" />
        <div className="ep-inner">
          <div className="ep-hd">
            <span className="ep-title">Email Preview</span>
            <button className="ep-close" onClick={() => !sending && onClose()} disabled={sending}>✕</button>
          </div>
          {lead && (
            <>
              <div className="ep-field">
                <strong>{lead.name}</strong>{lead.email ? <span> &lt;{lead.email}&gt;</span> : <span className="ep-no-email"> — no email on file</span>}
              </div>
              <div className="ep-field">We have {lead.function || 'Engineering'} candidates ready for {lead.company}</div>
              <textarea className="ep-ta" value={body} rows={9} onChange={(event) => setBody(event.target.value)} disabled={sending} />
              <div className="ep-char">{body.length} characters</div>
              {sendStatus === 'ok' && <div className="ep-status ok">Sent successfully!</div>}
              {sendStatus === 'error' && <div className="ep-status err">{sendError}</div>}
              <div className="ep-actions">
                <button className={`btn-copy ${copied ? 'ok' : ''}`} onClick={copy} disabled={sending}>
                  {copied ? 'Copied!' : 'Copy to Clipboard'}
                </button>
                <button
                  className="btn-send"
                  onClick={send}
                  disabled={sending || apiStatus?.resend === false}
                  title={apiStatus?.resend === false ? 'Add RESEND_API_KEY to enable email sending' : undefined}
                >
                  {sending ? 'Sending…' : 'Send Email'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailPreviewPanel;
