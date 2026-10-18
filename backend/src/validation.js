// Input checks shared by the board, column and card routes.

// Returns the trimmed title, or null when it is missing or blank.
export function cleanTitle(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

// A position is an index in a list: an integer, 0 or more.
export function isValidPosition(value) {
  return Number.isInteger(value) && value >= 0;
}
