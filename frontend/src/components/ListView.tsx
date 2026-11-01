import type { BoardDetail, Card, Label } from "../types.ts";

interface ListRow {
  card: Card;
  columnTitle: string;
  columnId: string;
}

interface ListViewProps {
  board: BoardDetail | null;
  filterAssignee?: string;
  filterLabel?: string;
  filterMine?: boolean;
  currentUserId?: string | null;
  sortBy?: string;
  onCardClick?: (card: Card) => void;
}

// Vue liste des cartes d'un board (filtre + tri)

export function ListView(props: ListViewProps) {
  const board = props.board;
  const filterAssignee = props.filterAssignee || "";
  const filterLabel = props.filterLabel || "";
  const filterMine = props.filterMine === true;
  const currentUserId = props.currentUserId || null;
  const sortBy = props.sortBy || "column";
  const onCardClick = props.onCardClick;

  // aplatit colonnes → lignes
  const rows: ListRow[] = [];
  if (board && board.columns) {
    for (let i = 0; i < board.columns.length; i++) {
      const col = board.columns[i];
      if (!col) {
        continue;
      }
      const cards = col.cards || [];
      for (let j = 0; j < cards.length; j++) {
        const card = cards[j];
        if (!card) {
          continue;
        }
        rows.push({
          card: card,
          columnTitle: col.title,
          columnId: col.id,
        });
      }
    }
  }

  const labelsById: Record<string, Label> = {};
  if (board && board.labels) {
    for (let L = 0; L < board.labels.length; L++) {
      const label = board.labels[L];
      if (label) {
        labelsById[label.id] = label;
      }
    }
  }

  // filtres
  const filtered: ListRow[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row) {
      continue;
    }
    const card = row.card;
    if (filterMine && currentUserId) {
      if (card.assignee_id !== currentUserId) {
        continue;
      }
    }
    if (filterAssignee) {
      if (card.assignee_id !== filterAssignee) {
        continue;
      }
    }
    if (filterLabel) {
      const ids = card.labelIds || [];
      if (ids.indexOf(filterLabel) === -1) {
        continue;
      }
    }
    filtered.push(row);
  }

  // tri
  filtered.sort(function (a, b) {
    if (sortBy === "title") {
      return (a.card.title || "").localeCompare(b.card.title || "");
    }
    if (sortBy === "due") {
      const da = a.card.due_date || "9999";
      const db = b.card.due_date || "9999";
      return da.localeCompare(db);
    }
    if (sortBy === "assignee") {
      const na = a.card.assignee_name || "zzz";
      const nb = b.card.assignee_name || "zzz";
      return na.localeCompare(nb);
    }
    // par défaut : colonne puis position
    if (a.columnTitle !== b.columnTitle) {
      return a.columnTitle.localeCompare(b.columnTitle);
    }
    return (a.card.position || 0) - (b.card.position || 0);
  });

  if (filtered.length === 0) {
    return (
      <div className="empty-state list-empty">
        <h3>Aucune carte</h3>
        <p>Modifie les filtres ou ajoute des cartes sur le kanban.</p>
      </div>
    );
  }

  return (
    <div className="list-view">
      <table className="list-table">
        <thead>
          <tr>
            <th>Titre</th>
            <th>Colonne</th>
            <th>Assigné</th>
            <th>Échéance</th>
            <th>Labels</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(function (row) {
            const card = row.card;
            const cardLabels = [];
            const lids = card.labelIds || [];
            for (let i = 0; i < lids.length; i++) {
              const labelId = lids[i];
              const label = labelId ? labelsById[labelId] : undefined;
              if (label) {
                cardLabels.push(label);
              }
            }
            return (
              <tr
                key={card.id}
                className="list-row"
                onClick={function () {
                  if (onCardClick) {
                    onCardClick(card);
                  }
                }}
              >
                <td className="list-title">{card.title}</td>
                <td>
                  <span
                    className={
                      "list-col-badge " + getListColumnClass(row.columnTitle)
                    }
                  >
                    {row.columnTitle}
                  </span>
                </td>
                <td>{card.assignee_name || "-"}</td>
                <td>{card.due_date || "-"}</td>
                <td>
                  <span className="list-labels">
                    {cardLabels.map(function (lab) {
                      const safeColor =
                        lab.color &&
                        /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(
                          lab.color
                        )
                          ? lab.color
                          : "#c7c7cc";
                      return (
                        <span
                          key={lab.id}
                          className="card-label"
                          style={{ backgroundColor: safeColor }}
                          title={lab.name}
                        />
                      );
                    })}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function getListColumnClass(title: string) {
  if (!title) {
    return "";
  }
  const t = title.trim().toLowerCase();
  if (t === "à faire" || t === "a faire") {
    return "list-col-todo";
  }
  if (t === "en cours") {
    return "list-col-doing";
  }
  if (t === "à tester" || t === "a tester") {
    return "list-col-test";
  }
  if (t === "terminé" || t === "termine") {
    return "list-col-done";
  }
  return "";
}
