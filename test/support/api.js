// Small wrappers around app.inject used by the newer API tests.

export function api(app, token) {
  return async function (method, url, payload) {
    const opts = { method: method, url: url, headers: {} };
    if (token) {
      opts.headers.authorization = "Bearer " + token;
    }
    if (payload !== undefined) {
      opts.payload = payload;
    }
    return app.inject(opts);
  };
}

// Creates a board and returns its id plus the ids of the 4 default columns.
export async function createBoard(call, title) {
  const res = await call("POST", "/api/boards", { title: title });
  if (res.statusCode !== 201) {
    throw new Error("board creation failed: " + res.statusCode + " " + res.body);
  }
  const boardId = res.json().id;
  const detail = await call("GET", "/api/boards/" + boardId);
  return {
    boardId: boardId,
    columns: detail.json().columns.map(function (c) {
      return c.id;
    }),
  };
}

// Titles of the visible cards of a column, in display order.
export async function columnTitles(call, boardId, columnId) {
  const detail = await call("GET", "/api/boards/" + boardId);
  const col = detail.json().columns.find(function (c) {
    return c.id === columnId;
  });
  return col.cards.map(function (c) {
    return c.title;
  });
}

export async function columnPositions(call, boardId, columnId) {
  const detail = await call("GET", "/api/boards/" + boardId);
  const col = detail.json().columns.find(function (c) {
    return c.id === columnId;
  });
  return col.cards.map(function (c) {
    return c.position;
  });
}
