export type MutationAction =
  | "create_initial_quote"
  | "create_renewal_quote"
  | "submit_quote"
  | "create_amendment_quote"
  | "apply_discount";

export function isProtectedMutation(
  action: MutationAction,
  context: { discountDecision?: "permitted" | "approval_required" | "rejected" }
): boolean {
  if (
    action === "create_initial_quote" ||
    action === "create_renewal_quote" ||
    action === "submit_quote" ||
    action === "create_amendment_quote"
  ) {
    return true;
  }
  if (action === "apply_discount") {
    return context.discountDecision !== "permitted";
  }
  return false;
}

export function requireConfirmation(
  action: MutationAction,
  context: {
    discountDecision?: "permitted" | "approval_required" | "rejected";
    confirmedByUser: boolean;
  }
): { required: boolean; satisfied: boolean; reason?: string } {
  const protected_ = isProtectedMutation(action, context);
  if (!protected_) {
    return { required: false, satisfied: true };
  }
  if (context.confirmedByUser === true) {
    return { required: true, satisfied: true };
  }
  return {
    required: true,
    satisfied: false,
    reason: "This action requires explicit user confirmation before it can proceed.",
  };
}
