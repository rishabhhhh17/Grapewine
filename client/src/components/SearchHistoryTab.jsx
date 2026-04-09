/* eslint-disable react/prop-types */
const SearchHistoryTab = ({ history, onApply }) => (
  <div>
    <div className="page-header">
      <h1 className="page-title">Search History</h1>
      <p className="page-subtitle">Past database and internet pulls.</p>
      <hr className="header-line" />
    </div>

    <div className="history-list">
      {history.length === 0 ? (
        <div className="empty">
          <div className="empty-h">No history yet</div>
        </div>
      ) : history.map((entry) => (
        <button key={entry.id || entry.created_at} className="history-item" onClick={() => onApply(entry)}>
          <div>
            <strong>{entry.role || 'Any role'} · {entry.city || 'Any city'}</strong>
            <p>{entry.search_type || entry.triggered_by}</p>
          </div>
          <div>
            <small>{entry.result_count ?? entry.leads_found ?? 0} leads</small>
            <small>{entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}</small>
          </div>
        </button>
      ))}
    </div>
  </div>
);

export default SearchHistoryTab;
