import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.tsx";
import * as boardsApi from "../api/boards.ts";
import * as cardsApi from "../api/cards.ts";
import * as columnsApi from "../api/columns.ts";
import type { ActivityEvent, BoardDetail, BoardViewMode, Card } from "../types.ts";
import { Column } from "../components/Column.tsx";
import { CardModal } from "../components/CardModal.tsx";
import { MembersModal } from "../components/MembersModal.tsx";
import { MemberAvatars } from "../components/MemberAvatars.tsx";
import { ActivityPanel } from "../components/ActivityPanel.tsx";
import { ArchivesPanel } from "../components/ArchivesPanel.tsx";
import { BrandLogo } from "../components/BrandLogo.tsx";
import { ListView } from "../components/ListView.tsx";
import { SearchPanel } from "../components/SearchPanel.tsx";
import { connectBoardSocket } from "../ws/boardSocket.ts";
import * as invitesApi from "../api/invites.ts";

export function Board() {
  const params = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showArchives, setShowArchives] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [archivedBoard, setArchivedBoard] = useState<BoardDetail | null>(null);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  // vue kanban | list
  const [viewMode, setViewMode] = useState<BoardViewMode>("kanban");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterLabel, setFilterLabel] = useState("");
  const [filterMine, setFilterMine] = useState(false);
  const [sortBy, setSortBy] = useState("column");

  const selectedCardRef = useRef(selectedCard);
  selectedCardRef.current = selectedCard;

  const loadBoard = useCallback(async function () {
    const openCard = selectedCardRef.current;
    try {
      const data = await boardsApi.getBoard(params.id);
      setBoard(data);
      setError("");
      if (openCard) {
        let found: Card | null = null;
        for (let i = 0; i < data.columns.length; i++) {
          const column = data.columns[i];
          const cards = (column && column.cards) || [];
          for (let j = 0; j < cards.length; j++) {
            const candidate = cards[j];
            if (candidate && candidate.id === openCard.id) {
              found = candidate;
            }
          }
        }
        setSelectedCard(found);
      }
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
    setLoading(false);
  }, [params.id]);

  async function openActivity() {
    try {
      const events = await invitesApi.listActivity(params.id, 50);
      setActivity(events);
      setShowActivity(true);
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function openArchives() {
    try {
      const data = await boardsApi.getBoard(params.id, { archived: true });
      setArchivedBoard(data);
      setShowArchives(true);
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function refreshArchives() {
    const data = await boardsApi.getBoard(params.id, { archived: true });
    setArchivedBoard(data);
    await loadBoard();
  }

  useEffect(
    function () {
      setLoading(true);
      void loadBoard();
    },
    [loadBoard]
  );

  // The socket is opened once per board, so its callback must not keep the
  // loadBoard of the first render: that one still sees selectedCard as null and
  // never closes or refreshes the card open in the modal.
  const loadBoardRef = useRef(loadBoard);
  loadBoardRef.current = loadBoard;

  useEffect(
    function () {
      if (!auth.token || !params.id) {
        return;
      }
      const socket = connectBoardSocket(auth.token, params.id, function (msg) {
        if (msg.type === "joined" || msg.type === "error") {
          return;
        }
        void loadBoardRef.current();
      });
      return function () {
        socket.close();
      };
    },
    [auth.token, params.id]
  );

  async function handleAddCard(columnId: string, title: string) {
    try {
      await cardsApi.createCard(columnId, title);
      await loadBoard();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function handleDeleteColumn(columnId: string) {
    try {
      await columnsApi.deleteColumn(columnId);
      // ferme la modal si la carte ouverte était dans cette colonne
      if (selectedCard) {
        let stillThere = false;
        if (board && board.columns) {
          for (let i = 0; i < board.columns.length; i++) {
            const column = board.columns[i];
            if (column && column.id === columnId) {
              const cards = column.cards || [];
              for (let j = 0; j < cards.length; j++) {
                const candidate = cards[j];
                if (candidate && candidate.id === selectedCard.id) {
                  stillThere = true;
                }
              }
            }
          }
        }
        if (stillThere) {
          setSelectedCard(null);
        }
      }
      await loadBoard();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function handleDropCard(cardId: string, fromColumnId: string, toColumnId: string) {
    try {
      let position = 0;
      if (board) {
        for (let i = 0; i < board.columns.length; i++) {
          const column = board.columns[i];
          if (column && column.id === toColumnId) {
            const cards = column.cards;
            position = cards ? cards.length : 0;
            if (fromColumnId === toColumnId && position > 0) {
              position = position - 1;
            }
          }
        }
      }
      await cardsApi.updateCard(cardId, {
        column_id: toColumnId,
        position: position,
      });
      await loadBoard();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function handleAddColumn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const fromForm = formData.get("columnTitle");
    const value = (typeof fromForm === "string" ? fromForm : newColumnTitle || "").trim();
    if (!value) {
      return;
    }
    try {
      await columnsApi.createColumn(params.id, value);
      setNewColumnTitle("");
      await loadBoard();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function handleDeleteBoard() {
    if (!window.confirm("Supprimer ce board ?")) {
      return;
    }
    try {
      await boardsApi.deleteBoard(params.id);
      void navigate("/");
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function handleExport() {
    try {
      const data = await boardsApi.exportBoard(params.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (board && board.title ? board.title : "board") + ".json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function handleAddMember(email: string) {
    await boardsApi.addMember(params.id, email);
    await loadBoard();
  }

  async function handleRemoveMember(userId: string) {
    await boardsApi.removeMember(params.id, userId);
    await loadBoard();
  }

  const isOwner = board && auth.user && board.owner_id === auth.user.id;
  const noColumns = board && (!board.columns || board.columns.length === 0);

  if (loading && !board) {
    return (
      <div className="page board-page">
        <header className="topbar board-topbar">
          <div className="topbar-left">
            <Link to="/" className="back-link">
              ← Boards
            </Link>
            <div className="skeleton skeleton-title" />
          </div>
        </header>
        <div className="board-columns">
          <div className="skeleton skeleton-column" />
          <div className="skeleton skeleton-column" />
          <div className="skeleton skeleton-column" />
        </div>
      </div>
    );
  }

  return (
    <div className="page board-page">
      <header className="topbar board-topbar">
        <div className="topbar-left">
          <Link to="/" className="topbar-brand topbar-brand-link" title="Accueil">
            <BrandLogo variant="mark" size="sm" />
          </Link>
          <Link to="/" className="back-link">
            ← Boards
          </Link>
          <h1>{board ? board.title : "Board"}</h1>
        </div>
        <div className="topbar-right">
          {board && board.members ? (
            <button
              type="button"
              className="avatars-btn"
              onClick={function () {
                setShowMembers(true);
              }}
            >
              <MemberAvatars members={board.members} max={4} />
            </button>
          ) : null}
          <button
            type="button"
            className="btn"
            onClick={function () {
              setShowSearch(true);
            }}
          >
            Recherche
          </button>
          <button
            type="button"
            className={viewMode === "kanban" ? "btn primary" : "btn"}
            onClick={function () {
              setViewMode("kanban");
            }}
          >
            Kanban
          </button>
          <button
            type="button"
            className={viewMode === "list" ? "btn primary" : "btn"}
            onClick={function () {
              setViewMode("list");
            }}
          >
            Liste
          </button>
          <button
            type="button"
            className="btn"
            onClick={function () {
              void handleExport();
            }}
          >
            Export
          </button>
          <button
            type="button"
            className="btn"
            onClick={function () {
              void openActivity();
            }}
          >
            Activité
          </button>
          <button
            type="button"
            className="btn"
            onClick={function () {
              void openArchives();
            }}
          >
            Archives
          </button>
          <button
            type="button"
            className="btn"
            onClick={function () {
              setShowMembers(true);
            }}
          >
            Membres
          </button>
          {isOwner ? (
            <button
              type="button"
              className="btn danger"
              onClick={function () {
                void handleDeleteBoard();
              }}
            >
              Supprimer
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="error board-error">{error}</p> : null}

      {viewMode === "list" ? (
        <div className="board-toolbar">
          <label className="toolbar-field">
            Assigné
            <select
              value={filterAssignee}
              onChange={function (e) {
                setFilterAssignee(e.target.value);
                setFilterMine(false);
              }}
            >
              <option value="">Tous</option>
              {(board && board.members ? board.members : []).map(function (m) {
                return (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="toolbar-field">
            Label
            <select
              value={filterLabel}
              onChange={function (e) {
                setFilterLabel(e.target.value);
              }}
            >
              <option value="">Tous</option>
              {(board && board.labels ? board.labels : []).map(function (lab) {
                return (
                  <option key={lab.id} value={lab.id}>
                    {lab.name}
                  </option>
                );
              })}
            </select>
          </label>
          <label className="toolbar-field toolbar-check">
            <input
              type="checkbox"
              checked={filterMine}
              onChange={function (e) {
                setFilterMine(e.target.checked);
                if (e.target.checked) {
                  setFilterAssignee("");
                }
              }}
            />
            Mes cartes
          </label>
          <label className="toolbar-field">
            Tri
            <select
              value={sortBy}
              onChange={function (e) {
                setSortBy(e.target.value);
              }}
            >
              <option value="column">Colonne</option>
              <option value="title">Titre</option>
              <option value="due">Échéance</option>
              <option value="assignee">Assigné</option>
            </select>
          </label>
        </div>
      ) : null}

      {noColumns ? (
        <div className="empty-state board-empty">
          <div className="empty-icon">🗂️</div>
          <h3>Board sans colonnes</h3>
          <p>Ajoute une colonne pour commencer à organiser tes cartes.</p>
        </div>
      ) : null}

      {viewMode === "list" ? (
        <ListView
          board={board}
          filterAssignee={filterAssignee}
          filterLabel={filterLabel}
          filterMine={filterMine}
          currentUserId={auth.user ? auth.user.id : null}
          sortBy={sortBy}
          onCardClick={function (card) {
            setSelectedCard(card);
          }}
        />
      ) : (
        <div className="board-columns">
          {board
            ? board.columns.map(function (column) {
                return (
                  <Column
                    key={column.id}
                    column={column}
                    labels={board.labels}
                    onAddCard={function (columnId, title) {
                      void handleAddCard(columnId, title);
                    }}
                    onDropCard={function (cardId, fromColumnId, toColumnId) {
                      void handleDropCard(cardId, fromColumnId, toColumnId);
                    }}
                    onDeleteColumn={function (columnId) {
                      void handleDeleteColumn(columnId);
                    }}
                    onCardClick={function (card) {
                      setSelectedCard(card);
                    }}
                  />
                );
              })
            : null}

          <form
            className="add-column"
            onSubmit={function (event) {
              void handleAddColumn(event);
            }}
          >
            <input
              type="text"
              name="columnTitle"
              placeholder="Nouvelle colonne"
              value={newColumnTitle}
              onChange={function (e) {
                setNewColumnTitle(e.target.value);
              }}
            />
            <button type="submit" className="btn primary">
              Ajouter
            </button>
          </form>
        </div>
      )}

      {selectedCard && board ? (
        <CardModal
          card={selectedCard}
          board={board}
          onClose={function () {
            setSelectedCard(null);
          }}
          onChange={loadBoard}
        />
      ) : null}

      {showMembers && board ? (
        <MembersModal
          board={board}
          currentUser={auth.user}
          onClose={function () {
            setShowMembers(false);
          }}
          onAdd={handleAddMember}
          onRemove={handleRemoveMember}
        />
      ) : null}

      {showActivity ? (
        <ActivityPanel
          events={activity}
          onClose={function () {
            setShowActivity(false);
          }}
        />
      ) : null}

      {showArchives ? (
        <ArchivesPanel
          board={archivedBoard}
          onClose={function () {
            setShowArchives(false);
          }}
          onChange={refreshArchives}
          onError={function (msg: string) {
            setError(msg);
          }}
        />
      ) : null}

      {showSearch ? (
        <SearchPanel
          onClose={function () {
            setShowSearch(false);
          }}
        />
      ) : null}
    </div>
  );
}
