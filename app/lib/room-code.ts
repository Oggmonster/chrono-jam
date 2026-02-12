export function normalizeRoomCode(input: string) {
  return input.trim().toUpperCase();
}

export function generateRoomCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}
