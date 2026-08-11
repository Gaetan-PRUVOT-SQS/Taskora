import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import * as boardsApi from "../api/boards.js";
import * as cardsApi from "../api/cards.js";
import * as columnsApi from "../api/columns.js";
import { Column } from "../components/Column.jsx";
import { CardModal } from "../components/CardModal.jsx";
import { MembersModal } from "../components/MembersModal.jsx";
import { MemberAvatars } from "../components/MemberAvatars.jsx";
import { ActivityPanel } from "../components/ActivityPanel.jsx";
import { ArchivesPanel } from "../components/ArchivesPanel.jsx";
import { BrandLogo } from "../components/BrandLogo.jsx";
import { ListView } from "../components/ListView.jsx";
import { SearchPanel } from "../components/SearchPanel.jsx";
import { connectBoardSocket } from "../ws/boardSocket.js";
import * as invitesApi from "../api/invites.js";

export function Board() {
  const params = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCard, setSelectedCard] = useState(null);
  const [showMembers, setShowMembers] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showArchives, setShowArchives] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [activity, setActivity] = useState([]);
  const [archivedBoard, setArchivedBoard] = useState(null);
  const [newColumnTitle, setNewColumnTitle] = useState("");
  // vue kanban | list
  const [viewMode, setViewMode] = useState("kanban");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterLabel, setFilterLabel] = useState("");
  const [filterMine, setFilterMine] = useState(false);
  const [sortBy, setSortBy] = useState("column");

  async function loadBoard() {
    try {
      const data = await boardsApi.getBoard(params.id);
      setBoard(data);
      setError("");
      if (selectedCard) {
        let found = null;
        for (let i = 0; i < data.columns.length; i++) {
          const cards = data.columns[i].cards || [];
          for (let j = 0; j < cards.length; j++) {
            if (cards[j].id === selectedCard.id) {
              found = cards[j];
            }
          }
        }
        setSelectedCard(found);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  async function openActivity() {
    try {
      const events = await invitesApi.listActivity(params.id, 50);
      setActivity(events);
      setShowActivity(true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function openArchives() {
    try {
      const data = await boardsApi.getBoard(params.id, { archived: true });
      setArchivedBoard(data);
      setShowArchives(true);
    } catch (err) {
      setError(err.message);
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
      loadBoard();
    },
    [params.id]
  );

  useEffect(
    function () {
      if (!auth.token || !params.id) {
        return;
      }
      const socket = connectBoardSocket(auth.token, params.id, function (msg) {
        if (msg.type === "joined" || msg.type === "error") {
          return;
        }
        loadBoard();
      });
      return function () {
        socket.close();
      };
    },
    [auth.token, params.id]
  );

  async function handleAddCard(columnId, title) {
    try {
      await cardsApi.createCard(columnId, title);
      await loadBoard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteColumn(columnId) {
    try {
      await columnsApi.deleteColumn(columnId);
      // ferme la modal si la carte ouverte était dans cette colonne
      if (selectedCard) {
        let stillThere = false;
        if (board && board.columns) {
          for (let i = 0; i < board.columns.length; i++) {
            if (board.columns[i].id === columnId) {
              const cards = board.columns[i].cards || [];
              for (let j = 0; j < cards.length; j++) {
                if (cards[j].id === selectedCard.id) {
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
      setError(err.message);
    }
  }

  async function handleDropCard(cardId, fromColumnId, toColumnId) {
    try {
      let position = 0;
      if (board) {
        for (let i = 0; i < board.columns.length; i++) {
          if (board.columns[i].id === toColumnId) {
            position = board.columns[i].cards
              ? board.columns[i].cards.length
              : 0;
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
      setError(err.message);
    }
  }

  async function handleAddColumn(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const value = String(
      formData.get("columnTitle") || newColumnTitle || ""
    ).trim();
    if (!value) {
      return;
    }
    try {
      await columnsApi.createColumn(params.id, value);
      setNewColumnTitle("");
      await loadBoard();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteBoard() {
    if (!window.confirm("Supprimer ce board ?")) {
      return;
    }
    try {
      await boardsApi.deleteBoard(params.id);
      navigate("/");
    } catch (err) {
      setError(err.message);
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
      setError(err.message);
    }
  }

  async function handleAddMember(email) {
    await boardsApi.addMember(params.id, email);
    await loadBoard();
  }

  async function handleRemoveMember(userId) {
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
          <button type="button" className="btn" onClick={handleExport}>
            Export
          </button>
          <button type="button" className="btn" onClick={openActivity}>
            Activité
          </button>
          <button type="button" className="btn" onClick={openArchives}>
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
              onClick={handleDeleteBoard}
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
                    onAddCard={handleAddCard}
                    onDropCard={handleDropCard}
                    onDeleteColumn={handleDeleteColumn}
                    onCardClick={function (card) {
                      setSelectedCard(card);
                    }}
                  />
                );
              })
            : null}

          <form className="add-column" onSubmit={handleAddColumn}>
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

      {selectedCard ? (
        <CardModal
          card={selectedCard}
          board={board}
          onClose={function () {
            setSelectedCard(null);
          }}
          onChange={loadBoard}
        />
      ) : null}

      {showMembers ? (
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
          onError={function (msg) {
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
