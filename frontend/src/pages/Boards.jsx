import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import * as boardsApi from "../api/boards.js";
import * as backupApi from "../api/backup.js";
import { BrandLogo } from "../components/BrandLogo.jsx";
import { SearchPanel } from "../components/SearchPanel.jsx";

export function Boards() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [boards, setBoards] = useState([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  async function loadBoards() {
    try {
      const data = await boardsApi.listBoards();
      setBoards(data);
      setError("");
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  useEffect(function () {
    loadBoards();
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    setError("");

    const formData = new FormData(event.target);
    const value = String(formData.get("title") || title || "").trim();

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
      setBoards(function (prev) {
        return [board].concat(prev);
      });
      navigate("/boards/" + board.id);
    } catch (err) {
      setError(err.message || "Erreur lors de la création");
    }
    setCreating(false);
  }

  function handleLogout() {
    auth.logout();
    navigate("/login");
  }

  async function handleBackup() {
    setBackingUp(true);
    setError("");
    try {
      await backupApi.downloadBackup();
    } catch (err) {
      setError(err.message || "Backup impossible");
    }
    setBackingUp(false);
  }

  async function handleImportFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const board = await boardsApi.importBoard(data);
      navigate("/boards/" + board.id);
    } catch (err) {
      setError(err.message || "Import impossible");
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
          <button
            type="button"
            className="btn"
            onClick={handleBackup}
            disabled={backingUp}
          >
            {backingUp ? "Backup…" : "Backup"}
          </button>
          <span className="user-name">{auth.user ? auth.user.name : ""}</span>
          <button type="button" className="btn" onClick={handleLogout}>
            Déconnexion
          </button>
        </div>
      </header>

      <main className="boards-main">
        <h2 className="page-title">Mes boards</h2>
        <p className="page-subtitle">Organise tes projets en tableaux kanban.</p>

        <form className="new-board" onSubmit={handleCreate}>
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
              onChange={handleImportFile}
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
