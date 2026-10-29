import * as archiveApi from "../api/archive.js";

export function ArchivesPanel(props) {
  const board = props.board;
  const cards = (board && board.archived_cards) || [];

  async function handleRestore(id) {
    try {
      await archiveApi.unarchiveCard(id);
      if (props.onChange) {
        await props.onChange();
      }
    } catch (err) {
      if (props.onError) {
        props.onError(err.message);
      }
    }
  }

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div
        className="modal"
        onClick={function (e) {
          e.stopPropagation();
        }}
      >
        <div className="modal-header">
          <h2>Archives</h2>
          <button type="button" className="btn" onClick={props.onClose}>
            Fermer
          </button>
        </div>
        {cards.length === 0 ? (
          <p className="hint">Aucune carte archivée.</p>
        ) : (
          <ul className="members-list">
            {cards.map(function (c) {
              return (
                <li key={c.id}>
                  <span>
                    {c.title}
                    <span className="hint"> : {c.column_title}</span>
                  </span>
                  <button
                    type="button"
                    className="btn small primary"
                    onClick={function () {
                      handleRestore(c.id);
                    }}
                  >
                    Restaurer
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
