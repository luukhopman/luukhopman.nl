"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useBodyClass } from "@/lib/browser";
import { formatDate, todayIso } from "@/lib/format";
import { apiFetch, redirectToLogin, UnauthorizedError } from "@/lib/http";
import type { CoffeeEntry, CoffeeVerdict } from "@/lib/types";

const API_URL = "/api/coffee";
const COFFEE_KINDS = ["Beans", "Ground", "Capsules", "Instant", "Decaf"];
const EMPTY_DRAFT = {
  name: "",
  brand: "",
  kind: "Beans",
  rating: 3,
  verdict: "okay" as CoffeeVerdict,
  purchased_on: todayIso(),
  notes: "",
};

type CoffeeFilter = "all" | "liked" | "disliked";
type CoffeeDraft = typeof EMPTY_DRAFT;

function CoffeeIcon({ kind = "cup" }: { kind?: "bean" | "cup" }) {
  return kind === "bean" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14.5 3.5c4.7 1.3 6.2 5.9 4.3 10.2-1.7 3.8-5.7 6.5-9.4 5.4-3.3-1-4.8-4.3-3.4-7.5 1.5-3.6 4.9-6.6 8.5-8.1Z" />
      <path d="M7.2 18.1c2.3-3.9 5.4-6.8 9.7-9.1" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 8.5h12v6.1a4.4 4.4 0 0 1-4.4 4.4H9.4A4.4 4.4 0 0 1 5 14.6V8.5Z" />
      <path d="M17 10h1.2a2.8 2.8 0 0 1 0 5.6H17M7 5.5c0 1 1 1 1 2M11 5.5c0 1 1 1 1 2M15 5.5c0 1 1 1 1 2" />
    </svg>
  );
}
function RatingStars({ rating, interactive = false, onChange }: {
  rating: number;
  interactive?: boolean;
  onChange?: (rating: number) => void;
}) {
  return (
    <div className={`coffee-stars${interactive ? " is-interactive" : ""}`} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const content = <span className={star <= rating ? "is-filled" : undefined}>★</span>;
        return interactive ? (
          <button
            key={star}
            type="button"
            className={star <= rating ? "is-selected" : undefined}
            aria-label={`${star} star${star === 1 ? "" : "s"}`}
            aria-pressed={star === rating}
            onClick={() => onChange?.(star)}
          >
            {content}
          </button>
        ) : (
          <span key={star} aria-hidden="true">{content}</span>
        );
      })}
    </div>
  );
}

function verdictLabel(verdict: CoffeeVerdict) {
  return verdict === "liked" ? "Liked" : verdict === "disliked" ? "Didn't like it" : "Okay";
}

function verdictClass(verdict: CoffeeVerdict) {
  return verdict === "liked" ? "is-liked" : verdict === "disliked" ? "is-disliked" : "is-okay";
}

export default function CoffeePage() {
  useBodyClass("coffee-body");

  const [coffees, setCoffees] = useState<CoffeeEntry[]>([]);
  const [draft, setDraft] = useState<CoffeeDraft>({ ...EMPTY_DRAFT });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<CoffeeFilter>("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLElement | null>(null);

  const loadCoffees = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiFetch(API_URL);
      if (!response.ok) throw new Error("Could not load coffee entries");
      const payload = (await response.json()) as { coffees?: CoffeeEntry[] };
      setCoffees(payload.coffees ?? []);
      setError("");
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/coffee");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not load coffee entries");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCoffees();
  }, [loadCoffees]);

  const kindOptions = useMemo(() => {
    const kinds = new Set(coffees.map((coffee) => coffee.kind));
    return [...new Set([...COFFEE_KINDS, ...kinds])].sort((a, b) => a.localeCompare(b));
  }, [coffees]);

  const visibleCoffees = useMemo(() => coffees.filter((coffee) => {
    const verdictMatches = filter === "all" || coffee.verdict === filter;
    const kindMatches = kindFilter === "all" || coffee.kind === kindFilter;
    return verdictMatches && kindMatches;
  }), [coffees, filter, kindFilter]);

  const likedCount = coffees.filter((coffee) => coffee.verdict === "liked").length;
  const averageRating = coffees.length
    ? (coffees.reduce((total, coffee) => total + coffee.rating, 0) / coffees.length).toFixed(1)
    : "—";
  const latestCoffee = coffees[0] ?? null;

  function resetForm() {
    setDraft({ ...EMPTY_DRAFT, purchased_on: todayIso() });
    setEditingId(null);
  }

  function beginEdit(coffee: CoffeeEntry) {
    setEditingId(coffee.id);
    setDraft({
      name: coffee.name,
      brand: coffee.brand ?? "",
      kind: coffee.kind,
      rating: coffee.rating,
      verdict: coffee.verdict,
      purchased_on: coffee.purchased_on,
      notes: coffee.notes ?? "",
    });
    setStatus("");
    setError("");
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function saveCoffee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setStatus("");
    setError("");
    try {
      const response = await apiFetch(editingId ? `${API_URL}/${editingId}` : API_URL, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not save coffee");
      }
      await loadCoffees();
      setStatus(editingId ? "Coffee updated." : "Coffee added.");
      resetForm();
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/coffee");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not save coffee");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCoffee(coffee: CoffeeEntry) {
    if (deletingId !== null) return;
    if (!window.confirm(`Remove ${coffee.name} from coffee history?`)) return;

    setDeletingId(coffee.id);
    setStatus("");
    setError("");
    try {
      const response = await apiFetch(`${API_URL}/${coffee.id}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || "Could not remove coffee");
      }
      if (editingId === coffee.id) resetForm();
      await loadCoffees();
      setStatus("Coffee removed.");
    } catch (caught) {
      if (caught instanceof UnauthorizedError) {
        redirectToLogin("/coffee");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Could not remove coffee");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="coffee-shell">
      <header className="coffee-header">
        <div className="coffee-heading-copy">
          <span className="coffee-heading-icon" aria-hidden="true"><CoffeeIcon /></span>
          <div>
            <p className="coffee-kicker">Brew log</p>
            <h1>Coffee</h1>
            <p>Remember what made the good cups.</p>
          </div>
        </div>
        <div className="coffee-bean-mark" aria-hidden="true"><CoffeeIcon kind="bean" /></div>
      </header>

      <section className="coffee-stats" aria-label="Coffee overview">
        <article>
          <span>Tracked</span>
          <strong>{coffees.length}</strong>
          <small>coffee{coffees.length === 1 ? "" : "s"}</small>
        </article>
        <article className="is-liked-stat">
          <span>Liked</span>
          <strong>{likedCount}</strong>
          <small>worth buying again</small>
        </article>
        <article>
          <span>Average</span>
          <strong>{averageRating}<i> / 5</i></strong>
          <small>your ratings</small>
        </article>
        <article className="is-latest-stat">
          <span>Latest</span>
          <strong>{latestCoffee ? latestCoffee.name : "—"}</strong>
          <small>{latestCoffee ? formatDate(latestCoffee.purchased_on) : "Nothing logged yet"}</small>
        </article>
      </section>

      <section className="coffee-form-card" ref={formRef} aria-labelledby="coffee-form-title">
        <div className="coffee-section-heading">
          <div>
            <p className="coffee-kicker">{editingId ? "Update entry" : "New entry"}</p>
            <h2 id="coffee-form-title">{editingId ? "Change coffee" : "Log a coffee"}</h2>
          </div>
          {editingId ? (
            <button type="button" className="coffee-quiet-button" onClick={resetForm}>Cancel</button>
          ) : <span className="coffee-form-cue">Takes a moment</span>}
        </div>

        <form className="coffee-form" onSubmit={saveCoffee}>
          <label>
            <span>Coffee name</span>
            <input
              type="text"
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ethiopia Yirgacheffe"
              maxLength={100}
              required
            />
          </label>
          <label>
            <span>Brand or roaster <i>optional</i></span>
            <input
              type="text"
              value={draft.brand}
              onChange={(event) => setDraft((current) => ({ ...current, brand: event.target.value }))}
              placeholder="Local roaster"
              maxLength={80}
            />
          </label>
          <label>
            <span>Kind</span>
            <input
              type="text"
              list="coffee-kind-options"
              value={draft.kind}
              onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value }))}
              placeholder="Beans, ground, capsules…"
              maxLength={60}
              required
            />
            <datalist id="coffee-kind-options">
              {COFFEE_KINDS.map((kind) => <option key={kind} value={kind} />)}
            </datalist>
          </label>
          <label>
            <span>Purchased</span>
            <input
              type="date"
              value={draft.purchased_on}
              onChange={(event) => setDraft((current) => ({ ...current, purchased_on: event.target.value }))}
              required
            />
          </label>
          <fieldset className="coffee-rating-field">
            <legend>Rating</legend>
            <RatingStars rating={draft.rating} interactive onChange={(rating) => setDraft((current) => ({ ...current, rating }))} />
          </fieldset>
          <fieldset className="coffee-verdict-field">
            <legend>Verdict</legend>
            <div className="coffee-verdict-toggle">
              {(["liked", "okay", "disliked"] as CoffeeVerdict[]).map((verdict) => (
                <button
                  key={verdict}
                  type="button"
                  className={draft.verdict === verdict ? `is-active ${verdictClass(verdict)}` : undefined}
                  aria-pressed={draft.verdict === verdict}
                  onClick={() => setDraft((current) => ({ ...current, verdict }))}
                >
                  {verdictLabel(verdict)}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="coffee-notes-field">
            <span>Notes <i>optional</i></span>
            <textarea
              value={draft.notes}
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Bright, chocolatey, too bitter…"
              maxLength={600}
              rows={2}
            />
          </label>
          <button className="coffee-submit" type="submit" disabled={saving || !draft.name.trim() || !draft.kind.trim()}>
            <CoffeeIcon />
            {saving ? "Saving…" : editingId ? "Save changes" : "Add coffee"}
          </button>
        </form>
      </section>

      {error ? <p className="coffee-message is-error" role="alert">{error}</p> : null}
      {status ? <p className="coffee-message is-success" role="status">{status}</p> : null}

      <section className="coffee-history" aria-labelledby="coffee-history-title">
        <div className="coffee-section-heading coffee-history-heading">
          <div>
            <p className="coffee-kicker">Your shelf</p>
            <h2 id="coffee-history-title">Coffee history</h2>
          </div>
          <span className="coffee-history-count">{visibleCoffees.length} shown</span>
        </div>
        <div className="coffee-history-filters" role="group" aria-label="Coffee filters">
          {(["all", "liked", "disliked"] as CoffeeFilter[]).map((nextFilter) => (
            <button
              key={nextFilter}
              type="button"
              className={filter === nextFilter ? "is-active" : undefined}
              aria-pressed={filter === nextFilter}
              onClick={() => setFilter(nextFilter)}
            >
              {nextFilter === "all" ? "All" : nextFilter === "liked" ? "Liked" : "Didn't like"}
            </button>
          ))}
          <label>
            <span className="sr-only">Filter by kind</span>
            <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
              <option value="all">All kinds</option>
              {kindOptions.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="coffee-loading" aria-label="Loading coffee history"><span /><span /><span /></div>
        ) : visibleCoffees.length === 0 ? (
          <div className="coffee-empty">
            <span className="coffee-empty-icon" aria-hidden="true"><CoffeeIcon kind="bean" /></span>
            <strong>{coffees.length ? "No coffees match these filters." : "No coffee logged yet."}</strong>
            <p>{coffees.length ? "Try another filter." : "Add the next bag so you know what to buy again."}</p>
          </div>
        ) : (
          <div className="coffee-history-list">
            {visibleCoffees.map((coffee) => (
              <article className="coffee-entry" key={coffee.id}>
                <div className="coffee-entry-icon" aria-hidden="true"><CoffeeIcon kind="bean" /></div>
                <div className="coffee-entry-main">
                  <div className="coffee-entry-topline">
                    <div>
                      <h3>{coffee.name}</h3>
                      {coffee.brand ? <p>{coffee.brand}</p> : null}
                    </div>
                    <time dateTime={coffee.purchased_on}>{formatDate(coffee.purchased_on)}</time>
                  </div>
                  <div className="coffee-entry-meta">
                    <span className="coffee-kind-chip">{coffee.kind}</span>
                    <span className={`coffee-verdict-chip ${verdictClass(coffee.verdict)}`}>{verdictLabel(coffee.verdict)}</span>
                    <RatingStars rating={coffee.rating} />
                  </div>
                  {coffee.notes ? <p className="coffee-entry-notes">{coffee.notes}</p> : null}
                </div>
                <div className="coffee-entry-actions">
                  <button type="button" onClick={() => beginEdit(coffee)} aria-label={`Edit ${coffee.name}`} title="Edit">
                    <i className="fa-solid fa-pen" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => void deleteCoffee(coffee)} disabled={deletingId !== null} aria-label={`Delete ${coffee.name}`} title="Delete">
                    <i className="fa-solid fa-trash-can" aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
