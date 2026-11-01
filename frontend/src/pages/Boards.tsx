import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.tsx";
import * as boardsApi from "../api/boards.ts";
import * as backupApi from "../api/backup.ts";
import { BrandLogo } from "../components/BrandLogo.tsx";
import { SearchPanel } from "../components/SearchPanel.tsx";
import type { BoardSummary } from "../types.ts";

export function Boards() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  // simple affichage : le serveur refuse de toute façon les non-admins
  const isAdmin = Boolean(auth.user && auth.user.is_admin === true);

  async function loadBoards() {
    try {
      const data = await boardsApi.listBoards();
      setBoards(data);
      setError("");
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
    setLoading(false);
  }

  useEffect(function () {
    void loadBoards();
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const formData = new FormData(event.currentTarget);
    const fromForm = formData.get("title");
    const value = (typeof fromForm === "string" ? fromForm : title || "").trim();

    if (!value) {
      setError("Écris un nom pour le board avant de créer.");
      return;
    }

    setCreating(true);
    try {
      const board = await boardsApi.createBoard(value, "");
      if (!board || !board.id) {
        setError("Le board n'a pas pu être créé.");
        setCreating(false);
        return;
      }
      setTitle("");
      setBoards(function (prev: BoardSummary[]) {
        return [board].concat(prev);
      });
      void navigate("/boards/" + board.id);
    } catch (err) {
      setError((err instanceof Error ? err.message : "") || "Erreur lors de la création");
    }
    setCreating(false);
  }

  function handleLogout() {
    auth.logout();
    void navigate("/login");
  }

  async function handleBackup() {
    setBackingUp(true);
    setError("");
    try {
      await backupApi.downloadBackup();
    } catch (err) {
      setError((err instanceof Error ? err.message : "") || "Backup impossible");
    }
    setBackingUp(false);
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const data: unknown = JSON.parse(text) as unknown;
      const board = await boardsApi.importBoard(data);
      void navigate("/boards/" + board.id);
    } catch (err) {
      setError((err instanceof Error ? err.message : "") || "Import impossible");
    }
    event.target.value = "";
  }

  return (
    <div className="page boards-page">
      <header className="topbar">
        <div className="topbar-brand">
          <BrandLogo variant="mark" size="sm" />
        </div>
        <div className="topbar-right">
          <button
            type="button"
            className="btn"
            onClick={function () {
              setShowSearch(true);
            }}
          >
            Recherche
          </button>
          {isAdmin ? (
            <button
              type="button"
              className="btn"
              onClick={function () {
                void handleBackup();
              }}
              disabled={backingUp}
            >
              {backingUp ? "Backup…" : "Backup"}
            </button>
          ) : null}
          <span className="user-name">{auth.user ? auth.user.name : ""}</span>
          <button type="button" className="btn" onClick={handleLogout}>
            Déconnexion
          </button>
        </div>
      </header>

      <main className="boards-main">
        <h2 className="page-title">Mes boards</h2>
        <p className="page-subtitle">Organise tes projets en tableaux kanban.</p>

        <form
          className="new-board"
          onSubmit={function (event) {
            void handleCreate(event);
          }}
        >
          <input
            type="text"
            name="title"
            placeholder="Nom du nouveau board"
            value={title}
            onChange={function (e) {
              setTitle(e.target.value);
            }}
            required
          />
          <button type="submit" className="btn primary" disabled={creating}>
            {creating ? "Création..." : "Créer"}
          </button>
          <label className="btn import-label">
            Importer JSON
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={function (event) {
                void handleImportFile(event);
              }}
            />
          </label>
        </form>

        {error ? <p className="error">{error}</p> : null}

        {loading ? (
          <div className="skeleton-grid">
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
            <div className="skeleton skeleton-card" />
          </div>
        ) : null}

        {!loading && boards.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>Aucun board pour l&apos;instant</h3>
            <p>
              Crée ton premier tableau ci-dessus pour commencer à organiser tes
              tâches.
            </p>
          </div>
        ) : null}

        {!loading && boards.length > 0 ? (
          <div className="boards-grid">
            {boards.map(function (board) {
              return (
                <Link
                  key={board.id}
                  to={"/boards/" + board.id}
                  className="board-card"
                >
                  <h2>{board.title}</h2>
                  <p>{board.description || "Sans description"}</p>
                </Link>
              );
            })}
          </div>
        ) : null}
      </main>

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
