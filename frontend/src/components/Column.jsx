import { useState } from "react";
import { Card } from "./Card.jsx";

export function Column(props) {
  const column = props.column;
  const [newTitle, setNewTitle] = useState("");
  const [dragOver, setDragOver] = useState(false);

  async function handleAddCard(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const value = String(formData.get("cardTitle") || newTitle || "").trim();
    if (!value) {
      return;
    }
    if (props.onAddCard) {
      await props.onAddCard(column.id, value);
    }
    setNewTitle("");
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (!dragOver) {
      setDragOver(true);
    }
  }

  function handleDragLeave(event) {
    // quitte vraiment la colonne (pas un enfant)
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    setDragOver(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragOver(false);
    const cardId = event.dataTransfer.getData("cardId");
    const fromColumnId = event.dataTransfer.getData("fromColumnId");
    if (props.onDropCard) {
      props.onDropCard(cardId, fromColumnId, column.id);
    }
  }

  function handleDelete() {
    const count = column.cards ? column.cards.length : 0;
    let message = 'Supprimer la colonne "' + column.title + '" ?';
    if (count > 0) {
      message =
        message +
        "\n\nAttention : " +
        count +
        " carte(s) seront aussi supprimée(s).";
    }
    if (!window.confirm(message)) {
      return;
    }
    if (props.onDeleteColumn) {
      props.onDeleteColumn(column.id);
    }
  }

  const cards = column.cards || [];
  const isEmpty = cards.length === 0;

  // surlignage par statut (titre de colonne)
  const statusClass = getColumnStatusClass(column.title);

  let columnClass = "column";
  if (statusClass) {
    columnClass = "column " + statusClass;
  }
  if (dragOver) {
    columnClass = columnClass + " column-drag-over";
  }

  return (
    <div
      className={columnClass}
      data-column-id={column.id}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="column-header">
        <h3>
          <span className="column-status-dot" aria-hidden="true" />
          {column.title}
        </h3>
        <div className="column-header-right">
          <span className="column-count">{cards.length}</span>
          <button
            type="button"
            className="btn-column-delete"
            title="Supprimer la colonne"
            onClick={handleDelete}
          >
            ×
          </button>
        </div>
      </div>

      <div className="column-cards">
        {isEmpty && !dragOver ? (
          <p className="empty-hint">Aucune carte : glisse-en une ici</p>
        ) : null}

        {dragOver ? <div className="drop-placeholder">Déposer ici</div> : null}

        {cards.map(function (card) {
          return (
            <Card
              key={card.id}
              card={card}
              columnId={column.id}
              labels={props.labels}
              onClick={props.onCardClick}
            />
          );
        })}
      </div>

      <form className="add-card" onSubmit={handleAddCard}>
        <input
          type="text"
          name="cardTitle"
          placeholder="Ajouter une carte"
          value={newTitle}
          onChange={function (e) {
            setNewTitle(e.target.value);
          }}
          required
        />
        <button type="submit" className="btn small primary">
          +
        </button>
      </form>
    </div>
  );
}

// couleurs selon le nom de la colonne (template de base)
function getColumnStatusClass(title) {
  if (!title) {
    return "";
  }
  const t = title.trim().toLowerCase();
  if (t === "à faire" || t === "a faire" || t === "todo") {
    return "column-todo";
  }
  if (t === "en cours" || t === "doing" || t === "in progress") {
    return "column-doing";
  }
  if (t === "à tester" || t === "a tester" || t === "to test" || t === "test") {
    return "column-test";
  }
  if (t === "terminé" || t === "termine" || t === "done" || t === "fini") {
    return "column-done";
  }
  return "";
}
