"use client";

import { useState } from "react";

type ConfirmationCardData = {
  title: string;
  lines: string[];
  confirmLabel: string;
  cancelLabel: string;
  requiresApproverName?: boolean;
};

export function ConfirmationCard({
  data,
  onConfirm,
  onCancel,
}: {
  data: ConfirmationCardData;
  onConfirm: (approverName?: string) => void;
  onCancel: () => void;
}) {
  const [approverName, setApproverName] = useState("");
  const trimmedApproverName = approverName.trim();
  return (
    <div className="cc-confirmation-card" role="alert">
      <h3>{data.title}</h3>
      {data.lines.map((line, index) => (
        <div key={index}>{line}</div>
      ))}
      {data.requiresApproverName && (
        <input
          required
          aria-label="Approving manager's name"
          placeholder="Approving manager's name"
          value={approverName}
          onChange={(event) => setApproverName(event.target.value)}
        />
      )}
      <div className="cc-confirmation-card__actions">
        <button
          className="cc-confirmation-card__button--primary"
          onClick={() => onConfirm(trimmedApproverName || undefined)}
          disabled={data.requiresApproverName && !trimmedApproverName}
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
