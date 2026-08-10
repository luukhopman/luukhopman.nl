import { describe, expect, it } from "vitest";

import {
  calculateSkullKingScore,
  createSkullKingGame,
  getSkullKingNextRound,
  getSkullKingTotal,
  isSkullKingRoundComplete,
} from "@/lib/skull-king";

describe("Skull King scoring", () => {
  it("awards 20 points per exact non-zero bid", () => {
    expect(calculateSkullKingScore(4, { bid: 3, tricks: 3, bonus: 0 })).toBe(60);
  });

  it("scores an exact zero bid using the round number", () => {
    expect(calculateSkullKingScore(7, { bid: 0, tricks: 0, bonus: 0 })).toBe(70);
    expect(calculateSkullKingScore(7, { bid: 0, tricks: 1, bonus: 0 })).toBe(-70);
  });

  it("penalises each trick a player is off and only adds bonuses on an exact bid", () => {
    expect(calculateSkullKingScore(5, { bid: 2, tricks: 4, bonus: 50 })).toBe(-20);
    expect(calculateSkullKingScore(5, { bid: 2, tricks: 2, bonus: 50 })).toBe(90);
  });

  it("tracks round completion and running totals", () => {
    const game = createSkullKingGame(["Anne", "Barty"]);
    game.rounds[0].entries = {
      "player-1": { bid: 1, tricks: 1, bonus: 0 },
      "player-2": { bid: 0, tricks: 0, bonus: 0 },
    };

    expect(isSkullKingRoundComplete(game.rounds[0], ["player-1", "player-2"])).toBe(true);
    expect(getSkullKingNextRound(game)).toBe(2);
    expect(getSkullKingTotal(game, "player-1")).toBe(20);
  });
});
