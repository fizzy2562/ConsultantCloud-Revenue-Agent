"use client";

import type { ConfirmationCardData } from "../lib/mockConversation";

export function ConfirmationCard({
  data,
  onConfirm,
  onCancel,
}: {
  data: ConfirmationCardData;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="cc-confirmation-card" role="alert">
      <h3>{data.title}</h3>
      {data.lines.map((line, index) => (
        <div key={index}>{line}</div>
      ))}
      <div className="cc-confirmation-card__actions">
        <button
          className="cc-confirmation-card__button--primary"
          onClick={onConfirm}
        >
          {data.confirmLabel}
        </button>
        <button
          className="cc-confirmation-card__button--secondary"
          onClick={onCancel}
        >
          {data.cancelLabel}
        </button>
      </div>
    </div>
  );
}
