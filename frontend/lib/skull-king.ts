export const SKULL_KING_ROUNDS = 10;
export const SKULL_KING_MIN_PLAYERS = 2;
export const SKULL_KING_MAX_PLAYERS = 8;

export type SkullKingPlayer = {
  id: string;
  name: string;
};

export type SkullKingEntry = {
  bid: number | null;
  tricks: number | null;
  bonus: number;
};

export type SkullKingRound = {
  number: number;
  entries: Record<string, SkullKingEntry>;
};

export type SkullKingGame = {
  players: SkullKingPlayer[];
  rounds: SkullKingRound[];
};

export const DEFAULT_SKULL_KING_PLAYERS = ["Player 1", "Player 2", "Player 3", "Player 4"];

export function emptySkullKingEntry(): SkullKingEntry {
  return { bid: null, tricks: null, bonus: 0 };
}

export function createSkullKingGame(
  playerNames: string[] = DEFAULT_SKULL_KING_PLAYERS,
): SkullKingGame {
  const players = playerNames.map((name, index) => ({
    id: "player-" + (index + 1),
    name: name.trim() || "Player " + (index + 1),
  }));

  return {
    players,
    rounds: Array.from({ length: SKULL_KING_ROUNDS }, (_, index) => ({
      number: index + 1,
      entries: {},
    })),
  };
}

export function calculateSkullKingScore(
  roundNumber: number,
  entry: SkullKingEntry,
): number | null {
  if (entry.bid === null || entry.tricks === null) return null;

  const exactBid = entry.bid === entry.tricks;
  if (!exactBid) {
    const penaltyUnits = entry.bid === 0 ? roundNumber : Math.abs(entry.bid - entry.tricks);
    return -penaltyUnits * 10;
  }

  const bidPoints = entry.bid === 0 ? roundNumber * 10 : entry.bid * 20;
  return bidPoints + Math.max(0, entry.bonus);
}

export function isSkullKingRoundComplete(
  round: SkullKingRound,
  playerIds: string[],
): boolean {
  return playerIds.length > 0 && playerIds.every((playerId) => {
    const entry = round.entries[playerId];
    return entry?.bid !== null && entry?.bid !== undefined &&
      entry.tricks !== null && entry.tricks !== undefined;
  });
}

export function getSkullKingTotal(game: SkullKingGame, playerId: string): number {
  return game.rounds.reduce(
    (total, round) =>
      total + (calculateSkullKingScore(
        round.number,
        round.entries[playerId] ?? emptySkullKingEntry(),
      ) ?? 0),
    0,
  );
}

export function getSkullKingNextRound(game: SkullKingGame): number | null {
  const playerIds = game.players.map((player) => player.id);
  return game.rounds.find((round) => !isSkullKingRoundComplete(round, playerIds))?.number ?? null;
}
