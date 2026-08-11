import { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as searchApi from "../api/search.js";

export function SearchPanel(props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSearch(event) {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) {
      setError("Au moins 2 caractères");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await searchApi.search(q);
      setResults(data);
    } catch (err) {
      setError(err.message);
      setResults(null);
    }
    setLoading(false);
  }

  function goBoard(boardId) {
    if (props.onClose) {
      props.onClose();
    }
    navigate("/boards/" + boardId);
  }

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div
        className="modal search-modal"
        onClick={function (e) {
          e.stopPropagation();
        }}
      >
        <div className="modal-header">
          <h2>Recherche</h2>
          <button type="button" className="btn" onClick={props.onClose}>
            Fermer
          </button>
        </div>

        <form className="inline-form search-form" onSubmit={handleSearch}>
          <input
            type="search"
            placeholder="Boards, cartes, commentaires…"
            value={query}
            autoFocus
            onChange={function (e) {
              setQuery(e.target.value);
            }}
          />
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? "…" : "Chercher"}
          </button>
        </form>

        {error ? <p className="error">{error}</p> : null}

        {results ? (
          <div className="search-results">
            <section className="modal-section">
              <h3>Boards ({results.boards.length})</h3>
              {results.boards.length === 0 ? (
                <p className="hint">Aucun board</p>
              ) : (
                <ul className="search-list">
                  {results.boards.map(function (b) {
                    return (
                      <li key={b.id}>
                        <button
                          type="button"
                          className="search-link"
                          onClick={function () {
                            goBoard(b.id);
                          }}
                        >
                          {b.title}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="modal-section">
              <h3>Cartes ({results.cards.length})</h3>
              {results.cards.length === 0 ? (
                <p className="hint">Aucune carte</p>
              ) : (
                <ul className="search-list">
                  {results.cards.map(function (c) {
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="search-link"
                          onClick={function () {
                            goBoard(c.board_id);
                          }}
                        >
                          <strong>{c.title}</strong>
                          <span className="hint">
                            {" "}
                            — {c.board_title} / {c.column_title}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="modal-section">
              <h3>Commentaires ({results.comments.length})</h3>
              {results.comments.length === 0 ? (
                <p className="hint">Aucun commentaire</p>
              ) : (
                <ul className="search-list">
                  {results.comments.map(function (cm) {
                    return (
                      <li key={cm.id}>
                        <button
                          type="button"
                          className="search-link"
                          onClick={function () {
                            goBoard(cm.board_id);
                          }}
                        >
                          <span>
                            {cm.body.slice(0, 80)}
                            {cm.body.length > 80 ? "…" : ""}
                          </span>
                          <span className="hint">
                            {" "}
                            — {cm.card_title} ({cm.user_name})
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
