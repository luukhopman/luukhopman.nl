"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { useBodyClass } from "@/lib/browser";
import { formatDate, todayIso } from "@/lib/format";
import { apiFetch, redirectToLogin, UnauthorizedError } from "@/lib/http";
import type { CoffeeEntry } from "@/lib/types";

const API_URL = "/api/coffee";
const EMPTY_DRAFT = {
  name: "",
  brand: "",
  rating: 7,
  purchased_on: todayIso(),
  notes: "",
};

type CoffeeDraft = typeof EMPTY_DRAFT;

function CoffeeIcon({ kind = "filter" }: { kind?: "bean" | "filter" }) {
  return kind === "bean" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M14.5 3.5c4.7 1.3 6.2 5.9 4.3 10.2-1.7 3.8-5.7 6.5-9.4 5.4-3.3-1-4.8-4.3-3.4-7.5 1.5-3.6 4.9-6.6 8.5-8.1Z" />
      <path d="M7.2 18.1c2.3-3.9 5.4-6.8 9.7-9.1" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 4.5h14l-4.7 7.7v2.2h-4.6v-2.2L5 4.5Z" />
      <path d="M8.1 14.4h7.8v1.7a3.4 3.4 0 0 1-3.4 3.4h-1a3.4 3.4 0 0 1-3.4-3.4v-1.7Z" />
      <path d="M8.3 8h7.4M12 2v2.5" />
    </svg>
  );
}

function formatRating(rating: number) {
  return Number(rating).toFixed(1);
}

export default function CoffeePage() {
  useBodyClass("coffee-body");

  const [coffees, setCoffees] = useState<CoffeeEntry[]>([]);
  const [draft, setDraft] = useState<CoffeeDraft>({ ...EMPTY_DRAFT });
  const [editingId, setEditingId] = useState<number | null>(null);
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

  function resetForm() {
    setDraft({ ...EMPTY_DRAFT, purchased_on: todayIso() });
    setEditingId(null);
  }

  function beginEdit(coffee: CoffeeEntry) {
    setEditingId(coffee.id);
    setDraft({
      name: coffee.name,
      brand: coffee.brand ?? "",
      rating: coffee.rating,
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
            <p className="coffee-kicker">Filter brew log</p>
            <h1>Coffee</h1>
          </div>
        </div>
        <div className="coffee-bean-mark" aria-hidden="true"><CoffeeIcon kind="bean" /></div>
      </header>

      <section className="coffee-form-card" ref={formRef} aria-labelledby="coffee-form-title">
        <div className="coffee-section-heading">
          <div>
            <p className="coffee-kicker">{editingId ? "Update entry" : "New entry"}</p>
            <h2 id="coffee-form-title">{editingId ? "Change coffee" : "Log a filter coffee"}</h2>
          </div>
          {editingId ? (
            <button type="button" className="coffee-quiet-button" onClick={resetForm}>Cancel</button>
          ) : null}
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
            <span>Purchased</span>
            <input
              type="date"
              value={draft.purchased_on}
              onChange={(event) => setDraft((current) => ({ ...current, purchased_on: event.target.value }))}
              required
            />
          </label>
          <label className="coffee-rating-field">
            <span>Rating <strong>{formatRating(draft.rating)} / 10</strong></span>
            <input
              type="number"
              min="0"
              max="10"
              step="0.1"
              inputMode="decimal"
              value={draft.rating}
              onChange={(event) => setDraft((current) => ({ ...current, rating: Number(event.target.value) }))}
              required
            />
          </label>
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
          <button className="coffee-submit" type="submit" disabled={saving || !draft.name.trim()}>
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
            <p className="coffee-kicker">Filter shelf</p>
            <h2 id="coffee-history-title">Coffee history</h2>
          </div>
          <span className="coffee-history-count">{coffees.length} logged</span>
        </div>

        {loading ? (
          <div className="coffee-loading" aria-label="Loading coffee history"><span /><span /><span /></div>
        ) : coffees.length === 0 ? (
          <div className="coffee-empty">
            <span className="coffee-empty-icon" aria-hidden="true"><CoffeeIcon kind="bean" /></span>
            <strong>No coffee logged yet.</strong>
            <p>Add the next bag so you know what to brew again.</p>
          </div>
        ) : (
          <div className="coffee-history-list">
            {coffees.map((coffee) => (
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
                  <div className="coffee-entry-rating">{formatRating(coffee.rating)} <span>/ 10</span></div>
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
