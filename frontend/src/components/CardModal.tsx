import { useState, type ChangeEvent, type FormEvent } from "react";
import * as cardsApi from "../api/cards.ts";
import * as labelsApi from "../api/labels.ts";
import * as checklistsApi from "../api/checklists.ts";
import * as commentsApi from "../api/comments.ts";
import * as archiveApi from "../api/archive.ts";
import * as attachmentsApi from "../api/attachments.ts";
import type { BoardDetail, Card, ChecklistItem } from "../types.ts";

interface CardModalProps {
  card: Card;
  board: BoardDetail;
  onClose: () => void;
  onChange?: () => void | Promise<void>;
}

export function CardModal(props: CardModalProps) {
  const board = props.board;
  const card = props.card;
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description || "");
  const [dueDate, setDueDate] = useState(card.due_date || "");
  const [coverColor, setCoverColor] = useState(card.cover_color || "");
  const [assigneeId, setAssigneeId] = useState(card.assignee_id || "");
  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState("#39ff14");
  const [checklistTitle, setChecklistTitle] = useState("");
  const [itemTexts, setItemTexts] = useState<Record<string, string>>({});
  const [commentText, setCommentText] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    if (props.onChange) {
      await props.onChange();
    }
  }

  async function saveTitle() {
    try {
      await cardsApi.updateCard(card.id, { title: title });
      await refresh();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function saveDescription() {
    try {
      await cardsApi.updateCard(card.id, { description: description });
      await refresh();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function saveDueDate() {
    try {
      await cardsApi.updateCard(card.id, {
        due_date: dueDate || null,
      });
      await refresh();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function saveCover() {
    try {
      await cardsApi.updateCard(card.id, {
        cover_color: coverColor || null,
      });
      await refresh();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function saveAssignee(value: string) {
    setAssigneeId(value);
    try {
      await cardsApi.updateCard(card.id, {
        assignee_id: value || null,
      });
      await refresh();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    try {
      const base64 = await readFileBase64(file);
      await attachmentsApi.uploadAttachment(
        card.id,
        file.name,
        file.type || "application/octet-stream",
        base64
      );
      await refresh();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
    event.target.value = "";
  }

  function readFileBase64(file: File): Promise<string> {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const raw = reader.result;
        const result = typeof raw === "string" ? raw : "";
        const parts = result.split(",");
        resolve(parts[1] || "");
      };
      reader.onerror = function () {
        reject(new Error("Lecture fichier impossible"));
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleDelete() {
    try {
      await cardsApi.deleteCard(card.id);
      if (props.onClose) {
        props.onClose();
      }
      await refresh();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function handleArchive() {
    try {
      await archiveApi.archiveCard(card.id);
      if (props.onClose) {
        props.onClose();
      }
      await refresh();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function handleAddComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!commentText.trim()) {
      return;
    }
    try {
      await commentsApi.createComment(card.id, commentText.trim());
      setCommentText("");
      await refresh();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function handleDeleteComment(id: string) {
    try {
      await commentsApi.deleteComment(id);
      await refresh();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function handleCreateLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!labelName.trim()) {
      return;
    }
    try {
      await labelsApi.createLabel(board.id, labelName.trim(), labelColor);
      setLabelName("");
      await refresh();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function toggleLabel(labelId: string) {
    try {
      const has = card.labelIds && card.labelIds.indexOf(labelId) !== -1;
      if (has) {
        await labelsApi.removeLabelFromCard(card.id, labelId);
      } else {
        await labelsApi.addLabelToCard(card.id, labelId);
      }
      await refresh();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function handleCreateChecklist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checklistTitle.trim()) {
      return;
    }
    try {
      await checklistsApi.createChecklist(card.id, checklistTitle.trim());
      setChecklistTitle("");
      await refresh();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function handleAddItem(checklistId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = itemTexts[checklistId] || "";
    if (!text.trim()) {
      return;
    }
    try {
      await checklistsApi.createChecklistItem(checklistId, text.trim());
      const next = Object.assign({}, itemTexts);
      next[checklistId] = "";
      setItemTexts(next);
      await refresh();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  async function toggleItem(item: ChecklistItem) {
    try {
      await checklistsApi.updateChecklistItem(item.id, {
        is_done: !item.is_done,
      });
      await refresh();
    } catch (err) {
      setError((err instanceof Error ? err.message : ""));
    }
  }

  // carte à jour depuis le board rechargé
  let liveCard = card;
  if (board && board.columns) {
    for (let i = 0; i < board.columns.length; i++) {
      const column = board.columns[i];
      const cards = (column && column.cards) || [];
      for (let j = 0; j < cards.length; j++) {
        const candidate = cards[j];
        if (candidate && candidate.id === card.id) {
          liveCard = candidate;
        }
      }
    }
  }

  return (
    <div className="modal-backdrop" onClick={props.onClose}>
      <div
        className="modal card-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Carte"
        onClick={function (e) {
          e.stopPropagation();
        }}
      >
        <div className="modal-header">
          <input
            className="modal-title-input"
            value={title}
            onChange={function (e) {
              setTitle(e.target.value);
            }}
            onBlur={function () {
              void saveTitle();
            }}
          />
          <button type="button" className="btn" onClick={props.onClose}>
            Fermer
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <label>
          Description
          <textarea
            value={description}
            onChange={function (e) {
              setDescription(e.target.value);
            }}
            onBlur={function () {
              void saveDescription();
            }}
            rows={4}
          />
        </label>

        <label>
          Date d&apos;échéance
          <input
            type="date"
            value={dueDate || ""}
            onChange={function (e) {
              setDueDate(e.target.value);
            }}
            onBlur={function () {
              void saveDueDate();
            }}
          />
        </label>

        <label>
          Assigné à
          <select
            value={assigneeId || liveCard.assignee_id || ""}
            onChange={function (e) {
              void saveAssignee(e.target.value);
            }}
          >
            <option value="">Personne</option>
            {(board.members || []).map(function (m) {
              return (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              );
            })}
          </select>
        </label>

        <label>
          Couverture (couleur)
          <div className="inline-form">
            <input
              type="color"
              value={coverColor || "#d4ff00"}
              onChange={function (e) {
                setCoverColor(e.target.value);
              }}
              onBlur={function () {
                void saveCover();
              }}
            />
            <button
              type="button"
              className="btn small"
              onClick={function () {
                setCoverColor("");
                cardsApi
                  .updateCard(card.id, { cover_color: null })
                  .then(refresh)
                  .catch(function (err) {
                    setError((err instanceof Error ? err.message : ""));
                  });
              }}
            >
              Retirer
            </button>
          </div>
        </label>

        <section className="modal-section">
          <h3>Pièces jointes</h3>
          <ul className="comments-list">
            {(liveCard.attachments || []).map(function (att) {
              return (
                <li key={att.id} className="comment-item">
                  <span>
                    {att.filename}{" "}
                    <span className="hint">
                      ({Math.round(att.size / 1024)} Ko)
                    </span>
                  </span>
                  <div className="inline-form">
                    <button
                      type="button"
                      className="btn small"
                      onClick={function () {
                        attachmentsApi
                          .downloadAttachment(att.id, att.filename)
                          .catch(function (err) {
                            setError((err instanceof Error ? err.message : ""));
                          });
                      }}
                    >
                      Télécharger
                    </button>
                    <button
                      type="button"
                      className="btn small danger"
                      onClick={function () {
                        attachmentsApi
                          .deleteAttachment(att.id)
                          .then(refresh)
                          .catch(function (err) {
                            setError((err instanceof Error ? err.message : ""));
                          });
                      }}
                    >
                      Supprimer
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <input
            type="file"
            onChange={function (event) {
              void handleFileChange(event);
            }}
          />
          <p className="hint">Max 2 Mo par fichier</p>
        </section>

        <section className="modal-section">
          <h3>Labels</h3>
          <div className="label-chips">
            {(board.labels || []).map(function (label) {
              const active =
                liveCard.labelIds &&
                liveCard.labelIds.indexOf(label.id) !== -1;
              const safeColor =
                label.color &&
                /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(
                  label.color
                )
                  ? label.color
                  : "#c7c7cc";
              return (
                <button
                  key={label.id}
                  type="button"
                  className={active ? "label-chip active" : "label-chip"}
                  style={{ backgroundColor: safeColor }}
                  onClick={function () {
                    void toggleLabel(label.id);
                  }}
                >
                  {label.name}
                </button>
              );
            })}
          </div>
          <form
            className="inline-form"
            onSubmit={function (event) {
              void handleCreateLabel(event);
            }}
          >
            <input
              type="text"
              placeholder="Nouveau label"
              value={labelName}
              onChange={function (e) {
                setLabelName(e.target.value);
              }}
            />
            <input
              type="color"
              value={labelColor}
              onChange={function (e) {
                setLabelColor(e.target.value);
              }}
            />
            <button type="submit" className="btn small">
              Ajouter
            </button>
          </form>
        </section>

        <section className="modal-section">
          <h3>Checklists</h3>
          {(liveCard.checklists || []).map(function (cl) {
            return (
              <div key={cl.id} className="checklist">
                <h4>{cl.title}</h4>
                <ul>
                  {(cl.items || []).map(function (item) {
                    return (
                      <li key={item.id}>
                        <label className="check-item">
                          <input
                            type="checkbox"
                            checked={item.is_done}
                            onChange={function () {
                              void toggleItem(item);
                            }}
                          />
                          <span
                            className={item.is_done ? "done" : ""}
                          >
                            {item.text}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <form
                  className="inline-form"
                  onSubmit={function (e) {
                    void handleAddItem(cl.id, e);
                  }}
                >
                  <input
                    type="text"
                    placeholder="Nouvel item"
                    value={itemTexts[cl.id] || ""}
                    onChange={function (e) {
                      const next = Object.assign({}, itemTexts);
                      next[cl.id] = e.target.value;
                      setItemTexts(next);
                    }}
                  />
                  <button type="submit" className="btn small">
                    +
                  </button>
                </form>
              </div>
            );
          })}
          <form
            className="inline-form"
            onSubmit={function (event) {
              void handleCreateChecklist(event);
            }}
          >
            <input
              type="text"
              placeholder="Nouvelle checklist"
              value={checklistTitle}
              onChange={function (e) {
                setChecklistTitle(e.target.value);
              }}
            />
            <button type="submit" className="btn small">
              Créer
            </button>
          </form>
        </section>

        <section className="modal-section">
          <h3>Commentaires</h3>
          <ul className="comments-list">
            {(liveCard.comments || []).map(function (c) {
              return (
                <li key={c.id} className="comment-item">
                  <div className="comment-meta">
                    <strong>{c.user_name || "Utilisateur"}</strong>
                    <span className="comment-date">
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="comment-body">{c.body}</p>
                  <button
                    type="button"
                    className="btn small"
                    onClick={function () {
                      void handleDeleteComment(c.id);
                    }}
                  >
                    Supprimer
                  </button>
                </li>
              );
            })}
          </ul>
          <form
            className="inline-form"
            onSubmit={function (event) {
              void handleAddComment(event);
            }}
          >
            <input
              type="text"
              placeholder="Écrire un commentaire… (@Nom pour mentionner)"
              value={commentText}
              onChange={function (e) {
                setCommentText(e.target.value);
              }}
            />
            <button type="submit" className="btn small primary">
              Envoyer
            </button>
          </form>
          <p className="hint">
            Astuce : utilise @Prénom pour mentionner un membre du board.
          </p>
        </section>

        <div className="modal-actions">
          <button
            type="button"
            className="btn"
            onClick={function () {
              void handleArchive();
            }}
          >
            Archiver
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={function () {
              void handleDelete();
            }}
          >
            Supprimer la carte
          </button>
        </div>
      </div>
    </div>
  );
}
