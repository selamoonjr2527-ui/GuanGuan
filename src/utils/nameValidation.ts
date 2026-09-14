import { Player } from '../types';

/**
 * Normalizes nickname for duplicate comparison (case-insensitive, trimmed)
 */
export const normalizeNickname = (name: string): string => {
  return name.trim().toLowerCase();
};

/**
 * Checks if a nickname is already taken by another player in the list.
 */
export const isNicknameDuplicate = (
  nickname: string,
  players: Player[],
  excludePlayerId?: string
): boolean => {
  const normalized = normalizeNickname(nickname);
  if (!normalized) return false;

  return players.some(
    (p) =>
      (!excludePlayerId || p.id !== excludePlayerId) &&
      normalizeNickname(p.nickname) === normalized
  );
};

/**
 * Finds the existing player that has the conflicting nickname.
 */
export const getDuplicatePlayer = (
  nickname: string,
  players: Player[],
  excludePlayerId?: string
): Player | undefined => {
  const normalized = normalizeNickname(nickname);
  if (!normalized) return undefined;

  return players.find(
    (p) =>
      (!excludePlayerId || p.id !== excludePlayerId) &&
      normalizeNickname(p.nickname) === normalized
  );
};

/**
 * Generates smart, friendly alternative nickname suggestions
 * e.g., "ต้น 2", "ต้น B", "ต้น (ใหม่)"
 */
export const generateNicknameSuggestions = (
  baseNickname: string,
  players: Player[],
  excludePlayerId?: string,
  fullName?: string
): string[] => {
  const trimmed = baseNickname.trim();
  if (!trimmed) return [];

  const existingNormalized = new Set(
    players
      .filter((p) => !excludePlayerId || p.id !== excludePlayerId)
      .map((p) => normalizeNickname(p.nickname))
  );

  const suggestions: string[] = [];

  // 1. Number suffix: e.g. "ต้น 2", "ต้น 3", ...
  let num = 2;
  while (num <= 99) {
    const candidate = `${trimmed} ${num}`;
    if (!existingNormalized.has(normalizeNickname(candidate))) {
      suggestions.push(candidate);
      break;
    }
    num++;
  }

  // 2. Letter suffix: e.g. "ต้น B", "ต้น A"
  const letters = ['B', 'A', 'C', 'X'];
  for (const letter of letters) {
    const candidate = `${trimmed} ${letter}`;
    if (!existingNormalized.has(normalizeNickname(candidate))) {
      suggestions.push(candidate);
      break;
    }
  }

  // 3. Full name initial or short word if provided
  if (fullName && fullName.trim()) {
    const nameParts = fullName.trim().split(/\s+/);
    if (nameParts.length > 0 && nameParts[0]) {
      const candidate = `${trimmed} (${nameParts[0]})`;
      if (!existingNormalized.has(normalizeNickname(candidate))) {
        suggestions.push(candidate);
      }
    }
  }

  // 4. Descriptor suffix: "ต้น (ใหม่)" or "ต้น แบด"
  const descriptors = ['(ใหม่)', 'แบด', '(W)'];
  for (const desc of descriptors) {
    const candidate = `${trimmed} ${desc}`;
    if (!existingNormalized.has(normalizeNickname(candidate)) && !suggestions.includes(candidate)) {
      suggestions.push(candidate);
      break;
    }
  }

  return suggestions.slice(0, 3);
};
