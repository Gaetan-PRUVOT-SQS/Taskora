import { useState, type DragEvent } from "react";
import type { Card as CardModel, Label } from "../types.ts";

interface CardProps {
  card: CardModel;
  labels?: Label[] | undefined;
  columnId: string;
  onDragStart?: ((cardId: string) => void) | undefined;
  onDragEnd?: (() => void) | undefined;
  onClick?: ((card: CardModel) => void) | undefined;
}

export function Card(props: CardProps) {
  const card = props.card;
  const labels = props.labels || [];
  const [dragging, setDragging] = useState(false);
  const cardLabels = [];
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (label && card.labelIds && card.labelIds.indexOf(label.id) !== -1) {
      cardLabels.push(label);
    }
  }

  let done = 0;
  let total = 0;
  if (card.checklists) {
    for (let c = 0; c < card.checklists.length; c++) {
      const checklist = card.checklists[c];
      const items = (checklist && checklist.items) || [];
      for (let it = 0; it < items.length; it++) {
        const item = items[it];
        total = total + 1;
        if (item && item.is_done) {
          done = done + 1;
        }
      }
    }
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.setData("cardId", card.id);
    event.dataTransfer.setData("fromColumnId", props.columnId);
    event.dataTransfer.effectAllowed = "move";
    setDragging(true);
    if (props.onDragStart) {
      props.onDragStart(card.id);
    }
  }

  function handleDragEnd() {
    setDragging(false);
    if (props.onDragEnd) {
      props.onDragEnd();
    }
  }

  let className = "card";
  if (dragging) {
    className = "card card-dragging";
  }

  // couleur uniquement si #hex (évite injection CSS)
  const safeCover =
    card.cover_color &&
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(card.cover_color)
      ? card.cover_color
      : null;
  const coverStyle = safeCover
    ? { borderTop: "6px solid " + safeCover }
    : undefined;

  return (
    <div
      className={className}
      draggable="true"
      data-card-id={card.id}
      data-column-id={props.columnId}
      style={coverStyle}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={function () {
        if (props.onClick) {
          props.onClick(card);
        }
      }}
    >
      <div className="card-labels">
        {cardLabels.map(function (label) {
          const safeColor =
            label.color &&
            /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(
              label.color
            )
              ? label.color
              : "#c7c7cc";
          return (
            <span
              key={label.id}
              className="card-label"
              style={{ backgroundColor: safeColor }}
              title={label.name}
            />
          );
        })}
      </div>
      <div className="card-title">{card.title}</div>
      <div className="card-meta">
        {total > 0 ? (
          <span className="meta-item">
            {done}/{total}
          </span>
        ) : null}
        {card.due_date ? (
          <span className="meta-item">{card.due_date}</span>
        ) : null}
        {card.assignee_name ? (
          <span
            className="meta-item meta-assignee"
            title={card.assignee_name}
          >
            {card.assignee_name.slice(0, 1).toUpperCase()}
          </span>
        ) : null}
      </div>
    </div>
  );
}
