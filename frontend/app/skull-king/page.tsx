"use client";

import { useEffect, useMemo, useState } from "react";

import {
  calculateSkullKingScore,
  createSkullKingGame,
  emptySkullKingEntry,
  getSkullKingNextRound,
  getSkullKingTotal,
  isSkullKingRoundComplete,
  SKULL_KING_MAX_PLAYERS,
  SKULL_KING_MIN_PLAYERS,
  SKULL_KING_ROUNDS,
  type SkullKingEntry,
  type SkullKingGame,
  type SkullKingPlayer,
} from "@/lib/skull-king";
import { useBodyClass } from "@/lib/browser";

const STORAGE_KEY = "skull-king-score-sheet-v1";

type DraftRoundEntry = {
  bid: string;
  tricks: string;
  bonus: string;
};

function formatScore(value: number | null) {
  if (value === null) return "—";
  return value > 0 ? "+" + value : String(value);
}

function formatRoundCards(roundNumber: number) {
  return roundNumber + (roundNumber === 1 ? " card" : " cards");
}

function toDraftEntry(entry: SkullKingEntry): DraftRoundEntry {
  return {
    bid: entry.bid === null ? "" : String(entry.bid),
    tricks: entry.tricks === null ? "" : String(entry.tricks),
    bonus: entry.bonus ? String(entry.bonus) : "",
  };
}

function createRoundDraft(game: SkullKingGame, roundNumber: number) {
  const round = game.rounds[roundNumber - 1];
  return Object.fromEntries(
    game.players.map((player) => [
      player.id,
      toDraftEntry(round?.entries[player.id] ?? emptySkullKingEntry()),
    ]),
  ) as Record<string, DraftRoundEntry>;
}

function isStoredGame(value: unknown): value is SkullKingGame {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SkullKingGame>;
  return (
    Array.isArray(candidate.players) &&
    candidate.players.length >= SKULL_KING_MIN_PLAYERS &&
    candidate.players.length <= SKULL_KING_MAX_PLAYERS &&
    candidate.players.every(
      (player) =>
        typeof player?.id === "string" &&
        typeof player?.name === "string" &&
        player.name.trim().length > 0,
    ) &&
    Array.isArray(candidate.rounds) &&
    candidate.rounds.length === SKULL_KING_ROUNDS
  );
}

function parseWholeNumber(value: string, max: number) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  return Math.min(max, Math.max(0, parsed));
}

function hasGameScores(game: SkullKingGame) {
  return game.rounds.some((round) =>
    Object.values(round.entries).some(
      (entry) => entry.bid !== null || entry.tricks !== null || entry.bonus > 0,
    ),
  );
}

export default function SkullKingPage() {
  useBodyClass("skull-king-body");

  const [game, setGame] = useState<SkullKingGame>(() => createSkullKingGame());
  const [hydrated, setHydrated] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [playerDrafts, setPlayerDrafts] = useState<SkullKingPlayer[]>([]);
  const [activeRound, setActiveRound] = useState<number | null>(null);
  const [roundDrafts, setRoundDrafts] = useState<Record<string, DraftRoundEntry>>({});
  const [confirmNewGameOpen, setConfirmNewGameOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const gameHasExistingScores = hasGameScores(game);
  const playerIds = useMemo(() => game.players.map((player) => player.id), [game.players]);
  const nextRound = useMemo(() => getSkullKingNextRound(game), [game]);
  const totals = useMemo(
    () => game.players.map((player) => ({ ...player, total: getSkullKingTotal(game, player.id) })),
    [game],
  );
  const leaderTotal = Math.max(...totals.map((player) => player.total), 0);
  const activeRoundData = activeRound === null ? null : game.rounds[activeRound - 1] ?? null;
  const activeRoundTotals = useMemo(() => {
    if (activeRound === null) return null;

    return game.players.reduce(
      (totals, player) => {
        const draft = roundDrafts[player.id] ?? { bid: "", tricks: "", bonus: "" };
        const bid = parseWholeNumber(draft.bid, activeRound);
        const tricks = parseWholeNumber(draft.tricks, activeRound);
        return {
          bid: totals.bid + (bid ?? 0),
          bidEntered: totals.bidEntered + (bid === null ? 0 : 1),
          tricks: totals.tricks + (tricks ?? 0),
          tricksEntered: totals.tricksEntered + (tricks === null ? 0 : 1),
        };
      },
      { bid: 0, bidEntered: 0, tricks: 0, tricksEntered: 0 },
    );
  }, [activeRound, game.players, roundDrafts]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as unknown;
      if (isStoredGame(stored)) {
        setGame(stored);
      } else {
        const initial = createSkullKingGame();
        setGame(initial);
        setPlayerDrafts(initial.players);
        setSetupOpen(true);
      }
    } catch {
      const initial = createSkullKingGame();
      setGame(initial);
      setPlayerDrafts(initial.players);
      setSetupOpen(true);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  }, [game, hydrated]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (confirmNewGameOpen) setConfirmNewGameOpen(false);
      else if (activeRound !== null) setActiveRound(null);
      else if (setupOpen && gameHasExistingScores) setSetupOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [activeRound, confirmNewGameOpen, gameHasExistingScores, setupOpen]);

  function openSetup() {
    setPlayerDrafts(game.players.map((player) => ({ ...player })));
    setError("");
    setSetupOpen(true);
  }

  function openNewGameConfirmation() {
    setConfirmNewGameOpen(true);
  }

  function startNewGame() {
    const initial = createSkullKingGame(game.players.map((player) => player.name));
    setGame(initial);
    setPlayerDrafts(initial.players);
    setConfirmNewGameOpen(false);
    setActiveRound(null);
    setStatus("");
    setError("");
    setSetupOpen(true);
  }

  function updatePlayerName(id: string, name: string) {
    setPlayerDrafts((current) =>
      current.map((player) => (player.id === id ? { ...player, name } : player)),
    );
  }

  function addPlayer() {
    if (playerDrafts.length >= SKULL_KING_MAX_PLAYERS || gameHasExistingScores) return;
    const index = playerDrafts.length + 1;
    setPlayerDrafts((current) => [
      ...current,
      { id: "player-" + Date.now() + "-" + index, name: "Player " + index },
    ]);
  }

  function removePlayer(id: string) {
    if (playerDrafts.length <= SKULL_KING_MIN_PLAYERS || gameHasExistingScores) return;
    setPlayerDrafts((current) => current.filter((player) => player.id !== id));
  }

  function savePlayers() {
    const names = playerDrafts.map((player, index) => ({
      ...player,
      name: player.name.trim() || "Player " + (index + 1),
    }));
    if (names.length < SKULL_KING_MIN_PLAYERS) {
      setError("Add at least two players.");
      return;
    }

    setGame((current) => ({ ...current, players: names }));
    setPlayerDrafts(names);
    setSetupOpen(false);
    setError("");
    setStatus("Players saved.");
  }

  function openRound(roundNumber: number) {
    setRoundDrafts(createRoundDraft(game, roundNumber));
    setError("");
    setActiveRound(roundNumber);
  }

  function updateRoundDraft(
    playerId: string,
    field: keyof DraftRoundEntry,
    value: string,
  ) {
    setRoundDrafts((current) => ({
      ...current,
      [playerId]: { ...current[playerId], [field]: value },
    }));
  }

  function clearRoundDrafts() {
    if (!activeRound) return;
    setRoundDrafts(
      Object.fromEntries(
        game.players.map((player) => [
          player.id,
          { bid: "", tricks: "", bonus: "" },
        ]),
      ),
    );
  }

  function saveRound() {
    if (!activeRound) return;
    const entries = Object.fromEntries(
      game.players.map((player) => {
        const draft = roundDrafts[player.id] ?? { bid: "", tricks: "", bonus: "" };
        return [
          player.id,
          {
            bid: parseWholeNumber(draft.bid, activeRound),
            tricks: parseWholeNumber(draft.tricks, activeRound),
            bonus: parseWholeNumber(draft.bonus, 500) ?? 0,
          },
        ];
      }),
    ) as Record<string, SkullKingEntry>;

    setGame((current) => ({
      ...current,
      rounds: current.rounds.map((round) =>
        round.number === activeRound ? { ...round, entries } : round,
      ),
    }));
    setActiveRound(null);
    setStatus("Round " + activeRound + " saved.");
    setError("");
  }

  if (!hydrated) {
    return <main className="skull-king-shell"><div className="skull-loading">Loading score sheet…</div></main>;
  }

  return (
    <main className="skull-king-shell">
      <header className="skull-king-header">
        <div>
          <p className="skull-kicker">Captain&apos;s log</p>
          <h1><span aria-hidden="true">☠</span> Skull King</h1>
          <p className="skull-header-note">Call your bid. Win your tricks. Keep the loot.</p>
        </div>
        <div className="skull-header-actions">
          <button className="skull-secondary-button" type="button" onClick={openSetup}>
            <span aria-hidden="true">♙</span> Players
          </button>
          <button className="skull-new-game-button" type="button" onClick={openNewGameConfirmation}>
            New game
          </button>
        </div>
      </header>

      {status ? <p className="skull-status" role="status">{status}</p> : null}
      {error && !setupOpen && !activeRound ? <p className="skull-error" role="alert">{error}</p> : null}

      <section className="skull-scoreboard" aria-label="Running totals">
        <div className="skull-scoreboard-heading">
          <div>
            <p className="skull-kicker">Crew standings</p>
            <h2>{nextRound ? "Round " + nextRound + " next" : "Game complete"}</h2>
          </div>
          {nextRound ? (
            <button className="skull-primary-button" type="button" onClick={() => openRound(nextRound)}>
              Enter round {nextRound}
            </button>
          ) : null}
        </div>
        <div className="skull-leaderboard">
          {totals.map((player) => (
            <div className={"skull-player-total" + (player.total === leaderTotal && leaderTotal !== 0 ? " is-leading" : "")} key={player.id}>
              <span>{player.name}</span>
              <strong>{player.total}</strong>
              <small>points</small>
            </div>
          ))}
        </div>
      </section>

      <section className="skull-sheet-card" aria-labelledby="skull-sheet-title">
        <div className="skull-section-heading">
          <div>
            <p className="skull-kicker">Captain&apos;s scorecard</p>
            <h2 id="skull-sheet-title">Round score sheet</h2>
          </div>
          <span className="skull-round-count">{SKULL_KING_ROUNDS} rounds</span>
        </div>
        <div className="skull-table-wrap">
          <table className="skull-score-table">
            <thead>
              <tr>
                <th scope="col">Round</th>
                {game.players.map((player) => <th scope="col" key={player.id}>{player.name}</th>)}
                <th scope="col"><span className="skull-sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody>
              {game.rounds.map((round) => {
                const complete = isSkullKingRoundComplete(round, playerIds);
                const isNext = round.number === nextRound;
                return (
                  <tr className={(complete ? "is-complete " : "") + (isNext ? "is-next" : "")} key={round.number}>
                    <th scope="row">
                      <strong>{round.number}</strong>
                      <small>{formatRoundCards(round.number)}</small>
                    </th>
                    {game.players.map((player) => {
                      const entry = round.entries[player.id] ?? emptySkullKingEntry();
                      const score = calculateSkullKingScore(round.number, entry);
                      return (
                        <td key={player.id}>
                          <button
                            className={"skull-score-cell" + (score === null ? " is-empty" : "")}
                            type="button"
                            onClick={() => openRound(round.number)}
                            aria-label={player.name + ", round " + round.number + ": " + (score === null ? "not entered" : score + " points")}
                          >
                            <strong>{formatScore(score)}</strong>
                            {entry.bid !== null && entry.tricks !== null ? (
                              <span>{entry.bid + " / " + entry.tricks + (entry.bonus > 0 ? " · +" + entry.bonus : "")}</span>
                            ) : (
                              <span>Enter</span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                    <td className="skull-row-action">
                      <button type="button" onClick={() => openRound(round.number)} aria-label={"Edit round " + round.number}>
                        {complete ? "Edit" : "Add"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                {totals.map((player) => <td key={player.id}>{player.total}</td>)}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="skull-mobile-rounds" aria-label="Mobile round score sheet">
          {game.rounds.map((round) => {
            const complete = isSkullKingRoundComplete(round, playerIds);
            const isNext = round.number === nextRound;
            return (
              <article className={(complete ? "is-complete " : "") + (isNext ? "is-next " : "") + "skull-mobile-round"} key={round.number}>
                <div className="skull-mobile-round-header">
                  <div className="skull-mobile-round-name">
                    <strong>Round {round.number}</strong>
                    <span>{formatRoundCards(round.number)}</span>
                  </div>
                  <span className="skull-mobile-round-status">
                    {complete ? "Complete" : isNext ? "Next" : "Not entered"}
                  </span>
                  <button type="button" onClick={() => openRound(round.number)}>
                    {complete ? "Edit" : "Enter"}
                  </button>
                </div>
                <div className="skull-mobile-round-players">
                  {game.players.map((player) => {
                    const entry = round.entries[player.id] ?? emptySkullKingEntry();
                    const score = calculateSkullKingScore(round.number, entry);
                    return (
                      <div className="skull-mobile-round-player" key={player.id}>
                        <span>{player.name}</span>
                        <strong>{formatScore(score)}</strong>
                        {entry.bid !== null && entry.tricks !== null ? (
                          <small>{entry.bid + " bid · " + entry.tricks + " won"}</small>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </article>
            );
          })}
        </div>
        <p className="skull-table-note">Tap any round to enter or correct the bids, tricks, and bonuses.</p>
      </section>

      <details className="skull-rules">
        <summary>Rules at a glance</summary>
        <div>
          <p>Exact bid: +20 per trick. Exact zero bid: +10 × cards in the round. Missed bid: −10 per trick off.</p>
          <p>Enter the total bonus for captured special cards; bonuses are counted only when the bid is exact.</p>
        </div>
      </details>

      {confirmNewGameOpen ? (
        <div
          className="skull-modal-overlay skull-confirm-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) setConfirmNewGameOpen(false);
          }}
        >
          <section className="skull-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="skull-new-game-title">
            <div className="skull-confirm-mark" aria-hidden="true">☠</div>
            <p className="skull-kicker">New voyage</p>
            <h2 id="skull-new-game-title">Start a new game?</h2>
            <p className="skull-confirm-note">The current score sheet will be cleared. Your player names will stay ready for the next game.</p>
            <div className="skull-confirm-actions">
              <button className="skull-secondary-button" type="button" onClick={() => setConfirmNewGameOpen(false)}>Keep this game</button>
              <button className="skull-primary-button" type="button" onClick={startNewGame}>Start new game</button>
            </div>
          </section>
        </div>
      ) : null}

      {setupOpen ? (
        <div
          className="skull-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget && gameHasExistingScores) setSetupOpen(false);
          }}
        >
          <section className="skull-modal" role="dialog" aria-modal="true" aria-labelledby="skull-players-title">
            <div className="skull-modal-header">
              <div>
                <p className="skull-kicker">{gameHasExistingScores ? "Game settings" : "New game"}</p>
                <h2 id="skull-players-title">{gameHasExistingScores ? "Edit players" : "Who is playing?"}</h2>
              </div>
              {gameHasExistingScores ? (
                <button className="skull-close-button" type="button" onClick={() => setSetupOpen(false)} aria-label="Close player settings">×</button>
              ) : null}
            </div>
            <p className="skull-modal-note">
              {gameHasExistingScores ? "You can rename players during a game." : "Use two to eight players. You can change names later."}
            </p>
            <div className="skull-player-editor">
              {playerDrafts.map((player, index) => (
                <label key={player.id}>
                  <span>{index + 1}</span>
                  <input
                    value={player.name}
                    onChange={(event) => updatePlayerName(player.id, event.target.value)}
                    maxLength={28}
                    aria-label={"Player " + (index + 1) + " name"}
                  />
                  {!gameHasExistingScores && playerDrafts.length > SKULL_KING_MIN_PLAYERS ? (
                    <button type="button" onClick={() => removePlayer(player.id)} aria-label={"Remove " + player.name}>×</button>
                  ) : null}
                </label>
              ))}
            </div>
            {!gameHasExistingScores && playerDrafts.length < SKULL_KING_MAX_PLAYERS ? (
              <button className="skull-add-player" type="button" onClick={addPlayer}>+ Add player</button>
            ) : null}
            {error && setupOpen ? <p className="skull-error" role="alert">{error}</p> : null}
            <div className="skull-modal-actions">
              {gameHasExistingScores ? <button className="skull-secondary-button" type="button" onClick={() => setSetupOpen(false)}>Cancel</button> : null}
              <button className="skull-primary-button" type="button" onClick={savePlayers}>
                {gameHasExistingScores ? "Save players" : "Start game"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {activeRoundData && activeRound ? (
        <div className="skull-modal-overlay" onClick={(event) => {
          if (event.target === event.currentTarget) setActiveRound(null);
        }}>
          <section className="skull-round-modal" role="dialog" aria-modal="true" aria-labelledby="skull-round-title">
            <div className="skull-modal-header">
              <div>
                <p className="skull-kicker">Round {activeRound} · {formatRoundCards(activeRound)}</p>
                <h2 id="skull-round-title">Record scores</h2>
              </div>
              <button className="skull-close-button" type="button" onClick={() => setActiveRound(null)} aria-label="Close round entry">×</button>
            </div>
            <p className="skull-modal-note">Enter each player’s bid and tricks won. Bonus is optional.</p>
            {activeRoundTotals ? (
              <div className="skull-round-totals" aria-live="polite" aria-label="Round totals">
                <div className="skull-round-total">
                  <span>Total bid</span>
                  <strong>{activeRoundTotals.bid}</strong>
                  <small>{activeRoundTotals.bidEntered}/{game.players.length} entered</small>
                </div>
                <div className="skull-round-total">
                  <span>Total won</span>
                  <strong>{activeRoundTotals.tricks}</strong>
                  <small>{activeRoundTotals.tricksEntered}/{game.players.length} entered</small>
                </div>
                <div className={"skull-round-total" + (activeRoundTotals.tricks === activeRound ? " is-balanced" : "")}>
                  <span>Cards this round</span>
                  <strong>{activeRound}</strong>
                  <small>{activeRoundTotals.tricks === activeRound ? "All accounted for" : activeRoundTotals.tricks < activeRound ? (activeRound - activeRoundTotals.tricks) + " still open" : "Check the total"}</small>
                </div>
              </div>
            ) : null}
            <div className="skull-round-entries">
              {game.players.map((player) => {
                const draft = roundDrafts[player.id] ?? { bid: "", tricks: "", bonus: "" };
                const preview = calculateSkullKingScore(activeRound, {
                  bid: parseWholeNumber(draft.bid, activeRound),
                  tricks: parseWholeNumber(draft.tricks, activeRound),
                  bonus: parseWholeNumber(draft.bonus, 500) ?? 0,
                });
                return (
                  <div className="skull-round-entry" key={player.id}>
                    <div className="skull-round-player">
                      <strong>{player.name}</strong>
                      <span>{preview === null ? "Waiting for bid and tricks" : formatScore(preview) + " this round"}</span>
                    </div>
                    <div className="skull-round-fields">
                      <label>
                        <span>Bid</span>
                        <input type="number" min="0" max={activeRound} inputMode="numeric" value={draft.bid} onChange={(event) => updateRoundDraft(player.id, "bid", event.target.value)} />
                      </label>
                      <label>
                        <span>Won</span>
                        <input type="number" min="0" max={activeRound} inputMode="numeric" value={draft.tricks} onChange={(event) => updateRoundDraft(player.id, "tricks", event.target.value)} />
                      </label>
                      <label>
                        <span>Bonus</span>
                        <input type="number" min="0" max="500" inputMode="numeric" placeholder="0" value={draft.bonus} onChange={(event) => updateRoundDraft(player.id, "bonus", event.target.value)} />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="skull-round-footer">
              <button className="skull-text-button" type="button" onClick={clearRoundDrafts}>Clear fields</button>
              <button className="skull-primary-button" type="button" onClick={saveRound}>Save round</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
