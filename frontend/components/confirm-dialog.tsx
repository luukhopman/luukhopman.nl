"use client";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
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
        <div className="confirm-icon">
          <i className="fa-solid fa-triangle-exclamation" />
        </div>
        <h2 className="confirm-title">{title}</h2>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button
            type="button"
            className="confirm-btn confirm-btn-cancel"
            onClick={onCancel}
          >
            <i className="fa-solid fa-xmark" /> Cancel
          </button>
          <button
            type="button"
            className="confirm-btn confirm-btn-danger"
            onClick={onConfirm}
          >
            <i className="fa-solid fa-trash" /> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
