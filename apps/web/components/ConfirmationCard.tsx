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
  busy,
  onConfirm,
  onCancel,
}: {
  data: ConfirmationCardData;
  busy: boolean;
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
        <>
          <label htmlFor="cc-approver-name">Approving manager's name</label>
          <input
            id="cc-approver-name"
            required
            aria-label="Approving manager's name"
            placeholder="Approving manager's name"
            value={approverName}
            onChange={(event) => setApproverName(event.target.value)}
            disabled={busy}
          />
          <p className="cc-confirmation-card__hint">
            This name is recorded for the audit trail only. This demo does not verify the approver's identity.
          </p>
        </>
      )}
      <div className="cc-confirmation-card__actions">
        <button
          className="cc-confirmation-card__button--primary"
          onClick={() => onConfirm(trimmedApproverName || undefined)}
          disabled={busy || (data.requiresApproverName && !trimmedApproverName)}
        >
          {data.confirmLabel}
        </button>
        <button
          className="cc-confirmation-card__button--secondary"
          onClick={onCancel}
          disabled={busy}
        >
          {data.cancelLabel}
        </button>
      </div>
    </div>
  );
}
