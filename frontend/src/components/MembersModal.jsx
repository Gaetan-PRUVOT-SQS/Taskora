import { useState } from "react";
import * as invitesApi from "../api/invites.js";

export function MembersModal(props) {
  const board = props.board;
  const currentUser = props.currentUser;
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [linkInfo, setLinkInfo] = useState("");

  const isOwner = board && currentUser && board.owner_id === currentUser.id;

  async function handleInvite(event) {
    event.preventDefault();
    setError("");
    try {
      if (props.onAdd) {
        await props.onAdd(email.trim());
      }
      setEmail("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRemove(userId) {
    setError("");
    try {
      if (props.onRemove) {
        await props.onRemove(userId);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateLink() {
    setError("");
    setLinkInfo("");
    try {
      const invite = await invitesApi.createInvite(board.id, { days: 7 });
      const full =
        window.location.origin + "/invite/" + invite.token;
      setLinkInfo(full);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(full);
      }
    } catch (err) {
      setError(err.message);
    }
  }

  if (!board) {
    return null;
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
          <h2>Membres</h2>
          <button type="button" className="btn" onClick={props.onClose}>
            Fermer
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <ul className="members-list">
          {(board.members || []).map(function (member) {
            return (
              <li key={member.id}>
                <span>
                  {member.name} ({member.email}) — {member.role}
                </span>
                {isOwner && member.role !== "owner" ? (
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={function () {
                      handleRemove(member.id);
                    }}
                  >
                    Retirer
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>

        {isOwner ? (
          <div>
            <form className="invite-form" onSubmit={handleInvite}>
              <input
                type="email"
                placeholder="Email d'un compte existant"
                value={email}
                onChange={function (e) {
                  setEmail(e.target.value);
                }}
                required
              />
              <button type="submit" className="btn primary">
                Inviter
              </button>
            </form>
            <div className="invite-link-box">
              <button
                type="button"
                className="btn"
                onClick={handleCreateLink}
              >
                Créer un lien d&apos;invitation
              </button>
              {linkInfo ? (
                <p className="hint">
                  Lien copié : <code>{linkInfo}</code>
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="hint">Seul le propriétaire peut inviter.</p>
        )}
      </div>
    </div>
  );
}
