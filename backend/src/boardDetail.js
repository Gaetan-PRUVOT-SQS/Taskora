// Construit le détail complet d'un board pour GET /api/boards/:id

export async function getBoardDetail(db, boardId, options) {
  const opts = options || {};
  const includeArchived = opts.includeArchived === true;

  const board = await db
    .prepare("SELECT * FROM boards WHERE id = ?")
    .get(boardId);
  if (!board) {
    return null;
  }

  const members = await db
    .prepare(
      `SELECT u.id, u.name, u.email, bm.role
       FROM board_members bm
       JOIN users u ON u.id = bm.user_id
       WHERE bm.board_id = ?
       ORDER BY bm.role DESC, u.name ASC`
    )
    .all(boardId);

  const labels = await db
    .prepare(
      "SELECT id, name, color FROM labels WHERE board_id = ? ORDER BY name ASC"
    )
    .all(boardId);

  let columnsSql =
    "SELECT id, title, position, archived_at FROM columns WHERE board_id = ?";
  if (!includeArchived) {
    columnsSql = columnsSql + " AND archived_at IS NULL";
  }
  columnsSql = columnsSql + " ORDER BY position ASC";
  const columns = await db.prepare(columnsSql).all(boardId);

  const resultColumns = [];
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    let cardsSql =
      `SELECT c.id, c.title, c.description, c.position, c.due_date, c.archived_at,
              c.cover_color, c.assignee_id,
              u.name AS assignee_name, u.email AS assignee_email
       FROM cards c
       LEFT JOIN users u ON u.id = c.assignee_id
       WHERE c.column_id = ?`;
    if (!includeArchived) {
      cardsSql = cardsSql + " AND c.archived_at IS NULL";
    }
    cardsSql = cardsSql + " ORDER BY c.position ASC";
    const cards = await db.prepare(cardsSql).all(col.id);

    const resultCards = [];
    for (let j = 0; j < cards.length; j++) {
      const card = cards[j];
      const labelRows = await db
        .prepare("SELECT label_id FROM card_labels WHERE card_id = ?")
        .all(card.id);
      const labelIds = [];
      for (let k = 0; k < labelRows.length; k++) {
        labelIds.push(labelRows[k].label_id);
      }

      const checklists = await db
        .prepare(
          "SELECT id, title, position FROM checklists WHERE card_id = ? ORDER BY position ASC"
        )
        .all(card.id);

      const resultChecklists = [];
      for (let c = 0; c < checklists.length; c++) {
        const cl = checklists[c];
        const items = await db
          .prepare(
            "SELECT id, text, is_done, position FROM checklist_items WHERE checklist_id = ? ORDER BY position ASC"
          )
          .all(cl.id);

        const resultItems = [];
        for (let it = 0; it < items.length; it++) {
          const doneVal = items[it].is_done;
          resultItems.push({
            id: items[it].id,
            text: items[it].text,
            is_done: doneVal === 1 || doneVal === true,
            position: items[it].position,
          });
        }

        resultChecklists.push({
          id: cl.id,
          title: cl.title,
          position: cl.position,
          items: resultItems,
        });
      }

      const comments = await db
        .prepare(
          `SELECT c.id, c.card_id, c.user_id, c.body, c.created_at, c.updated_at,
                  u.name AS user_name
           FROM card_comments c
           JOIN users u ON u.id = c.user_id
           WHERE c.card_id = ?
           ORDER BY c.created_at ASC`
        )
        .all(card.id);

      let atts = [];
      try {
        const attachments = await db
          .prepare(
            `SELECT id, card_id, filename, mime, size, uploaded_by, created_at
             FROM card_attachments WHERE card_id = ? ORDER BY created_at ASC`
          )
          .all(card.id);
        for (let a = 0; a < attachments.length; a++) {
          atts.push({
            id: attachments[a].id,
            card_id: attachments[a].card_id,
            filename: attachments[a].filename,
            mime: attachments[a].mime,
            size: attachments[a].size,
            uploaded_by: attachments[a].uploaded_by,
            created_at: attachments[a].created_at,
            url: "/api/attachments/" + attachments[a].id + "/download",
          });
        }
      } catch (err) {
        atts = [];
      }

      resultCards.push({
        id: card.id,
        title: card.title,
        description: card.description || "",
        position: card.position,
        due_date: card.due_date || null,
        archived_at: card.archived_at || null,
        cover_color: card.cover_color || null,
        assignee_id: card.assignee_id || null,
        assignee_name: card.assignee_name || null,
        assignee_email: card.assignee_email || null,
        labelIds: labelIds,
        checklists: resultChecklists,
        comments: comments,
        attachments: atts,
      });
    }

    resultColumns.push({
      id: col.id,
      title: col.title,
      position: col.position,
      archived_at: col.archived_at || null,
      cards: resultCards,
    });
  }

  let archivedCards = [];
  if (includeArchived) {
    archivedCards = await db
      .prepare(
        `SELECT ca.id, ca.title, ca.description, ca.position, ca.due_date, ca.archived_at,
                ca.column_id, co.title AS column_title
         FROM cards ca
         JOIN columns co ON co.id = ca.column_id
         WHERE co.board_id = ? AND ca.archived_at IS NOT NULL
         ORDER BY ca.archived_at DESC`
      )
      .all(boardId);
  }

  return {
    id: board.id,
    title: board.title,
    description: board.description || "",
    owner_id: board.owner_id,
    created_at: board.created_at,
    members: members,
    labels: labels,
    columns: resultColumns,
    archived_cards: archivedCards,
  };
}
