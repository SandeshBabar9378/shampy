export function isValidVideoId(id: unknown): id is string {
  if (typeof id !== "string") return false;
  return /^[A-Za-z0-9_-]{11}$/.test(id);
}
