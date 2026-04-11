/* eslint-disable react/prop-types */
import { useState } from 'react';

const COLS = ['Found', 'Selected', 'Email Sent', 'Replied', 'Onboarded to Tal'];

const COL_COLOR = {
  Found: 'var(--t3)',
  Selected: 'var(--ok)',
  'Email Sent': 'var(--c)',
  Replied: 'var(--am)',
  'Onboarded to Tal': 'var(--ok)',
};

const scoreStyle = (score) => (
  score >= 8
    ? { background: 'rgba(74,222,128,.16)', color: 'var(--ok)' }
    : score >= 5
      ? { background: 'rgba(251,191,36,.16)', color: 'var(--am)' }
      : { background: 'rgba(248,113,113,.16)', color: 'var(--bad)' }
);

const stageOf = (lead) => lead.pipeline_stage || lead.status || 'Found';

const PipelineTab = ({ leads, onStatusChange }) => {
  const [dragOverCol, setDragOverCol] = useState(null);
  const [draggingId, setDraggingId] = useState(null);

  const getLeads = (col) => leads.filter((lead) => stageOf(lead) === col);

  const handleDragStart = (event, lead) => {
    setDraggingId(lead.id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('leadId', String(lead.id));
    event.dataTransfer.setData('fromStage', stageOf(lead));
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverCol(null);
  };

  const handleDragOver = (event, col) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverCol(col);
  };

  const handleDrop = async (event, toStage) => {
    event.preventDefault();
    const leadId = event.dataTransfer.getData('leadId');
    const fromStage = event.dataTransfer.getData('fromStage');
    setDragOverCol(null);
    setDraggingId(null);
    if (!leadId || fromStage === toStage) return;
    await onStatusChange(leadId, toStage);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Pipeline</h1>
        <p className="page-subtitle">Drag cards between columns to move leads through stages.</p>
        <hr className="header-line" />
      </div>

      <div className="kanban">
        {COLS.map((col) => {
          const colLeads = getLeads(col);
          const isOver = dragOverCol === col;
          return (
            <div
              key={col}
              className={`kb-col ${isOver ? 'kb-col-over' : ''}`}
              onDragOver={(event) => handleDragOver(event, col)}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={(event) => handleDrop(event, col)}
            >
              <div className="kb-col-hd">
                <span className="kb-col-name" style={{ color: COL_COLOR[col] }}>{col}</span>
                <span className="kb-badge">{colLeads.length}</span>
              </div>
              {colLeads.length === 0
                ? (
                  <div className={`kb-empty ${isOver ? 'kb-empty-over' : ''}`}>
                    {isOver ? 'Drop here' : 'No leads in this stage'}
                  </div>
                )
                : colLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className={`kb-card ${draggingId === lead.id ? 'kb-dragging' : ''}`}
                    draggable
                    onDragStart={(event) => handleDragStart(event, lead)}
                    onDragEnd={handleDragEnd}
                  >
                    <div className="kb-name">{lead.name}</div>
                    <div className="kb-ttl">{lead.title}</div>
                    <div className="kb-foot">
                      <span className="kb-co">{lead.company}</span>
                      <span className="kb-score" style={scoreStyle(Number(lead.activity_score || 0))}>
                        {lead.activity_score}/10
                      </span>
                    </div>
                    {(lead.source_platforms || []).length > 0 && (
                      <div className="src-badges" style={{ marginTop: 8 }}>
                        {(lead.source_platforms || []).slice(0, 2).map((source) => (
                          <span key={source} className="src-b">{source}</span>
                        ))}
                      </div>
                    )}
                    {col === 'Email Sent' && (
                      <div className="kb-actions">
                        <button className="btn-secondary" onClick={() => onStatusChange(lead.id, 'Replied')}>
                          Mark as Replied
                        </button>
                      </div>
                    )}
                    {col === 'Replied' && (
                      <div className="kb-actions">
                        <button className="btn-secondary" onClick={() => onStatusChange(lead.id, 'Onboarded to Tal')}>
                          Mark as Onboarded
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PipelineTab;
