"use client";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmTone?: "danger" | "primary";
  iconClassName?: string;
  confirmIconClassName?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmTone = "danger",
  iconClassName = "fa-solid fa-triangle-exclamation",
  confirmIconClassName = confirmTone === "danger" ? "fa-solid fa-trash" : "fa-solid fa-check",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={(event) => {
      if (event.target === event.currentTarget) {
        onCancel();
      }
    }}>
      <div className="modal-content confirm-modal-content">
        <div className={`confirm-icon${confirmTone === "primary" ? " confirm-icon-primary" : ""}`}>
          <i className={iconClassName} />
        </div>
        <h2 className="confirm-title">{title}</h2>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button
            type="button"
            className="confirm-btn confirm-btn-cancel"
            onClick={onCancel}
          >
            <i className="fa-solid fa-xmark" /> {cancelLabel}
          </button>
          <button
            type="button"
            className={`confirm-btn ${
              confirmTone === "primary" ? "confirm-btn-primary" : "confirm-btn-danger"
            }`}
            onClick={onConfirm}
          >
            <i className={confirmIconClassName} /> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
