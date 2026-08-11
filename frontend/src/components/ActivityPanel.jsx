export function ActivityPanel(props) {
  const events = props.events || [];

  function label(ev) {
    const who = ev.actor_name || "Quelqu'un";
    if (ev.type === "comment.created") {
      return who + " a commenté une carte";
    }
    if (ev.type === "card.archived") {
      return who + " a archivé « " + (ev.payload.title || "carte") + " »";
    }
    if (ev.type === "card.unarchived") {
      return who + " a restauré une carte";
    }
    if (ev.type === "member.joined") {
      return who + " a rejoint le board";
    }
    return who + " — " + ev.type;
  }

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div
        className="modal activity-panel"
        onClick={function (e) {
          e.stopPropagation();
        }}
      >
        <div className="modal-header">
          <h2>Activité</h2>
          <button type="button" className="btn" onClick={props.onClose}>
            Fermer
          </button>
        </div>
        {events.length === 0 ? (
          <p className="hint">Aucune activité pour l&apos;instant.</p>
        ) : (
          <ul className="activity-list">
            {events.map(function (ev) {
              return (
                <li key={ev.id}>
                  <div>{label(ev)}</div>
                  <span className="comment-date">
                    {new Date(ev.created_at).toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
