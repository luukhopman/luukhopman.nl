"use client";

import { FormEvent, KeyboardEvent, MouseEvent, useEffect, useMemo, useState } from "react";

import { ConfirmDialog } from "../../components/confirm-dialog";
import { triggerHaptic, useBodyClass, useLockedBody } from "../../lib/browser";
import { timeAgo } from "../../lib/format";
import type { GiftIdea } from "../../lib/types";

const API_URL = "/api/gifts";

const PERSON_COLORS = [
  "#a78bfa", "#6ee7b7", "#67e8f9", "#f87171", "#38bdf8",
  "#c084fc", "#e879f9", "#4ade80", "#f472b6", "#60a5fa",
];

function colorForName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PERSON_COLORS[Math.abs(hash) % PERSON_COLORS.length];
}

function initials(name: string) {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

type ConfirmState = {
  title: string;
  message: string;
  confirmLabel: string;
  iconClassName?: string;
  confirmIconClassName?: string;
  onConfirm: () => void;
} | null;

function emptyForm() {
  return {
    recipient_name: "",
    title: "",
    url: "",
    notes: "",
  };
}

function emptyPasswordForm() {
  return {
    password: "",
    confirmPassword: "",
  };
}

async function giftsFetch(input: RequestInfo | URL, init?: RequestInit) {
  return fetch(input, {
    ...init,
    credentials: "same-origin",
  });
}

export default function GiftsPage() {
  const [gifts, setGifts] = useState<GiftIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [search, setSearch] = useState("");
  const [addModalRecipient, setAddModalRecipient] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [editing, setEditing] = useState<GiftIdea | null>(null);
  const [editForm, setEditForm] = useState(emptyForm());
  const [passwordForm, setPasswordForm] = useState(emptyPasswordForm());
  const [passwordStatus, setPasswordStatus] = useState("");
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const hasActiveSearch = search.trim().length > 0;

  useBodyClass("gifts-body");
  useLockedBody(Boolean(editing || confirmState || addModalRecipient !== null || passwordModalOpen));

  useEffect(() => {
    void fetchGifts();
  }, []);

  async function fetchGifts() {
    setLoading(true);

    try {
      const response = await giftsFetch(API_URL);
      if (response.status === 401) {
        window.location.href = "/gifts-login?redirect=/gifts";
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to fetch gift ideas");
      }

      setGifts((await response.json()) as GiftIdea[]);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const groupedGifts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const visibleGifts = normalizedSearch
      ? gifts.filter((gift) => {
        const haystack = [
          gift.recipient_name,
          gift.title,
          gift.url || "",
          gift.notes || "",
        ]
          .join("\n")
          .toLowerCase();
        return haystack.includes(normalizedSearch);
      })
      : gifts;

    const grouped = new Map<string, GiftIdea[]>();

    for (const gift of visibleGifts) {
      const key = gift.recipient_name;
      const current = grouped.get(key) ?? [];
      current.push(gift);
      grouped.set(key, current);
    }

    return Array.from(grouped.entries()).sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [gifts, search]);

  function openAddModal(recipientName: string) {
    setForm({ ...emptyForm(), recipient_name: recipientName });
    setAddModalRecipient(recipientName);
  }

  function openNewPersonModal() {
    setForm(emptyForm());
    setAddModalRecipient("");
  }

  function openPasswordModal() {
    setPasswordForm(emptyPasswordForm());
    setPasswordStatus("");
    setPasswordModalOpen(true);
  }

  async function handleCreateGift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);

    try {
      const response = await giftsFetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (response.status === 401) {
        window.location.href = "/gifts-login?redirect=/gifts";
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to add gift idea");
      }

      setForm(emptyForm());
      setAddModalRecipient(null);
      await fetchGifts();
      triggerHaptic("success");
    } catch (error) {
      console.error(error);
      triggerHaptic("error");
      alert("Failed to save gift idea.");
    } finally {
      setSubmitting(false);
    }
  }

  function openEditModal(gift: GiftIdea) {
    setEditing(gift);
    setEditForm({
      recipient_name: gift.recipient_name,
      title: gift.title,
      url: gift.url || "",
      notes: gift.notes || "",
    });
  }

  async function handleEditGift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    try {
      const response = await giftsFetch(`${API_URL}/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });

      if (response.status === 401) {
        window.location.href = "/gifts-login?redirect=/gifts";
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to update gift idea");
      }

      setEditing(null);
      await fetchGifts();
      triggerHaptic("success");
    } catch (error) {
      console.error(error);
      triggerHaptic("error");
      alert("Failed to update gift idea.");
    }
  }

  async function togglePurchased(gift: GiftIdea) {
    try {
      const response = await giftsFetch(`${API_URL}/${gift.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchased: !gift.purchased }),
      });

      if (response.status === 401) {
        window.location.href = "/gifts-login?redirect=/gifts";
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to update gift idea");
      }

      await fetchGifts();
      triggerHaptic(gift.purchased ? "tap" : "success");
    } catch (error) {
      console.error(error);
      triggerHaptic("error");
    }
  }

  async function deleteGift(gift: GiftIdea) {
    try {
      const response = await giftsFetch(`${API_URL}/${gift.id}`, {
        method: "DELETE",
      });

      if (response.status === 401) {
        window.location.href = "/gifts-login?redirect=/gifts";
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to delete gift idea");
      }

      setEditing((current) => (current?.id === gift.id ? null : current));
      setConfirmState(null);
      await fetchGifts();
      triggerHaptic("delete");
    } catch (error) {
      console.error(error);
      triggerHaptic("error");
    }
  }

  async function lockGifts() {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await giftsFetch("/api/gifts/logout", {
        method: "POST",
      });
    } catch (error) {
      console.error(error);
    } finally {
      window.location.href = "/gifts-login?redirect=/gifts";
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (changingPassword) return;

    const nextPassword = passwordForm.password.trim();
    const confirmedPassword = passwordForm.confirmPassword.trim();

    if (!nextPassword) {
      setPasswordStatus("Choose a new gifts password.");
      return;
    }

    if (nextPassword !== confirmedPassword) {
      setPasswordStatus("Enter the same password twice.");
      return;
    }

    setChangingPassword(true);
    setPasswordStatus("Updating password...");

    try {
      const response = await giftsFetch("/api/gifts/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: nextPassword }),
      });

      if (response.status === 401) {
        window.location.href = "/gifts-login?redirect=/gifts";
        return;
      }

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: string } | null;
        setPasswordStatus(body?.detail || "Couldn't change the gifts password.");
        return;
      }

      setPasswordModalOpen(false);
      setPasswordForm(emptyPasswordForm());
      setPasswordStatus("");
      triggerHaptic("success");
    } catch (error) {
      console.error(error);
      setPasswordStatus("Couldn't connect. Try again.");
      triggerHaptic("error");
    } finally {
      setChangingPassword(false);
    }
  }

  function handleGiftRowClick(gift: GiftIdea) {
    openEditModal(gift);
  }

  function handleGiftRowKeyDown(event: KeyboardEvent<HTMLDivElement>, gift: GiftIdea) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openEditModal(gift);
    }
  }

  function stopGiftRowClick(event: MouseEvent<HTMLElement>) {
    event.stopPropagation();
  }

  return (
    <>
      <main className="gifts-shell">
        <div className="gifts-topbar">
          <h1><span>🎁</span> Gifts</h1>
          <div className="gifts-topbar-actions">
            <div className="gifts-search">
              <i className="fa-solid fa-magnifying-glass" />
              <input
                type="search"
                placeholder="Search gifts..."
                aria-label="Search gifts"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <button
              type="button"
              className="gifts-btn-ghost"
              disabled={changingPassword || loggingOut}
              aria-label={changingPassword ? "Changing gifts password" : "Change gifts password"}
              onClick={openPasswordModal}
            >
              <i className="fa-solid fa-key" />
              <span className="gifts-btn-label">Change password</span>
            </button>
            <button
              type="button"
              className="gifts-btn-ghost"
              disabled={loggingOut}
              aria-label={loggingOut ? "Locking gifts" : "Lock gifts"}
              onClick={() => void lockGifts()}
            >
              <i className="fa-solid fa-lock" />
              <span className="gifts-btn-label">{loggingOut ? "Locking..." : "Lock gifts"}</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="gift-empty">Loading...</div>
        ) : groupedGifts.length === 0 ? (
          <div className="gift-empty">
            {hasActiveSearch ? "No gifts match your search." : "No gifts yet. Add a person to get started."}
          </div>
        ) : (
          <div className="gifts-persons">
            {groupedGifts.map(([recipientName, recipientGifts]) => {
              const color = colorForName(recipientName);
              return (
                <div key={recipientName} className="person-card">
                  <div className="person-ribbon" style={{ background: color }} />
                  <div className="person-card-body">
                    <div className="person-header">
                      <div
                        className="person-avatar"
                        style={{ background: color }}
                      >
                        {initials(recipientName)}
                      </div>
                      <div className="person-header-info">
                        <h2>{recipientName}</h2>
                        <span>
                          {recipientGifts.length} idea{recipientGifts.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="person-add-btn"
                        title={`Add idea for ${recipientName}`}
                        aria-label={`Add idea for ${recipientName}`}
                        onClick={() => openAddModal(recipientName)}
                      >
                        <i className="fa-solid fa-plus" />
                      </button>
                    </div>
                    <div className="person-ideas">
                      {recipientGifts.map((gift) => (
                        <div
                          key={gift.id}
                          className={`idea-row${gift.purchased ? " idea-bought" : ""}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`Edit ${gift.title}`}
                          onClick={() => handleGiftRowClick(gift)}
                          onKeyDown={(event) => handleGiftRowKeyDown(event, gift)}
                        >
                          <button
                            type="button"
                            className={`idea-check${gift.purchased ? " is-checked" : ""}`}
                            aria-label={
                              gift.purchased
                                ? `Mark ${gift.title} as not bought`
                                : `Mark ${gift.title} as bought`
                            }
                            onClick={(event) => {
                              stopGiftRowClick(event);
                              void togglePurchased(gift);
                            }}
                          >
                            {gift.purchased ? <i className="fa-solid fa-check" /> : null}
                          </button>
                          <div className="idea-body">
                            <p className={`idea-title${gift.purchased ? " idea-bought-title" : ""}`}>
                              {gift.title}
                            </p>
                            {gift.notes ? (
                              <p className="idea-detail">{gift.notes}</p>
                            ) : null}
                            {gift.url ? (
                              <p className="idea-detail">
                                <a href={gift.url} target="_blank" rel="noreferrer" onClick={stopGiftRowClick}>
                                  <i className="fa-solid fa-link" /> Link
                                </a>
                                {" · "}
                                {timeAgo(gift.created_at)}
                              </p>
                            ) : (
                              <p className="idea-detail">{timeAgo(gift.created_at)}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              className="new-person-card"
              aria-label="Add person"
              onClick={openNewPersonModal}
            >
              <i className="fa-solid fa-plus" />
              Add person
            </button>
          </div>
        )
        }
      </main>

      <button
        type="button"
        className="gifts-mobile-add"
        onClick={openNewPersonModal}
      >
        <i className="fa-solid fa-plus" />
        Add person
      </button>

      {/* Add idea modal */}
      {addModalRecipient !== null ? (
        <div
          className="gift-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setAddModalRecipient(null);
            }
          }}
        >
          <div className="gift-modal">
            <div className="gift-modal-header">
              <h2>{addModalRecipient ? `Add for ${addModalRecipient}` : "New gift idea"}</h2>
              <button type="button" onClick={() => setAddModalRecipient(null)}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <form className="gift-form-modal" onSubmit={handleCreateGift}>
              <div className="gift-form-grid">
                {!addModalRecipient ? (
                  <label className="gift-field">
                    <span>For</span>
                    <input
                      type="text"
                      placeholder="Person name"
                      autoFocus
                      value={form.recipient_name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          recipient_name: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                ) : null}
                <label className="gift-field">
                  <span>Idea</span>
                  <input
                    type="text"
                    placeholder="What are you thinking of?"
                    autoFocus={Boolean(addModalRecipient)}
                    value={form.title}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label className="gift-field">
                  <span>Link</span>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={form.url}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        url: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="gift-field">
                  <span>Notes</span>
                  <textarea
                    rows={2}
                    placeholder="Budget, color, size..."
                    value={form.notes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <button type="submit" className="gift-submit" disabled={submitting}>
                {submitting ? "Saving..." : "Add"}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {passwordModalOpen ? (
        <div
          className="gift-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget && !changingPassword) {
              setPasswordModalOpen(false);
              setPasswordStatus("");
            }
          }}
        >
          <div className="gift-modal">
            <div className="gift-modal-header">
              <h2>Change gifts password</h2>
              <button
                type="button"
                onClick={() => {
                  setPasswordModalOpen(false);
                  setPasswordStatus("");
                }}
                disabled={changingPassword}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <form className="gift-form-modal" onSubmit={handleChangePassword}>
              <div className="gift-form-grid">
                <p className="gift-form-copy">
                  This changes the password for the current gift plan and keeps all existing ideas.
                </p>
                <label className="gift-field">
                  <span>New password</span>
                  <input
                    type="password"
                    placeholder="Choose a new gifts password"
                    autoFocus
                    autoComplete="new-password"
                    value={passwordForm.password}
                    onChange={(event) => {
                      setPasswordForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }));
                      if (passwordStatus) setPasswordStatus("");
                    }}
                    required
                  />
                </label>
                <label className="gift-field">
                  <span>Confirm password</span>
                  <input
                    type="password"
                    placeholder="Enter the same password again"
                    autoComplete="new-password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) => {
                      setPasswordForm((current) => ({
                        ...current,
                        confirmPassword: event.target.value,
                      }));
                      if (passwordStatus) setPasswordStatus("");
                    }}
                    required
                  />
                </label>
              </div>
              <div className="gift-form-status" aria-live="polite">
                {passwordStatus}
              </div>
              <button type="submit" className="gift-submit" disabled={changingPassword}>
                {changingPassword ? "Updating..." : "Save password"}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {/* Edit modal */}
      {editing ? (
        <div
          className="gift-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setEditing(null);
            }
          }}
        >
          <div className="gift-modal">
            <div className="gift-modal-header">
              <h2>Edit idea</h2>
              <div className="gift-modal-header-actions">
                <button
                  type="button"
                  className="gift-modal-delete"
                  aria-label={`Delete ${editing.title}`}
                  title="Delete gift idea"
                  onClick={() =>
                    setConfirmState({
                      title: "Delete this idea?",
                      message: `"${editing.title}" will be removed from the gift list.`,
                      confirmLabel: "Delete",
                      iconClassName: "fa-regular fa-trash-can",
                      confirmIconClassName: "fa-solid fa-trash",
                      onConfirm: () => void deleteGift(editing),
                    })
                  }
                >
                  <i className="fa-solid fa-trash" />
                </button>
                <button type="button" onClick={() => setEditing(null)}>
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            </div>
            <form className="gift-form-modal" onSubmit={handleEditGift}>
              <div className="gift-form-grid">
                <label className="gift-field">
                  <span>For</span>
                  <input
                    type="text"
                    value={editForm.recipient_name}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        recipient_name: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label className="gift-field">
                  <span>Idea</span>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label className="gift-field">
                  <span>Link</span>
                  <input
                    type="url"
                    value={editForm.url}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        url: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="gift-field">
                  <span>Notes</span>
                  <textarea
                    rows={3}
                    value={editForm.notes}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        notes: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <button type="submit" className="gift-submit">
                Save Changes
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title || ""}
        message={confirmState?.message || ""}
        confirmLabel={confirmState?.confirmLabel || "Delete"}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => confirmState?.onConfirm()}
      />
    </>
  );
}
