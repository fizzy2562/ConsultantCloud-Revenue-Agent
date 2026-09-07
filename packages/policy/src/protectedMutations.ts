export type MutationAction =
  | "create_initial_quote"
  | "create_renewal_quote"
  | "submit_quote"
  | "create_amendment_quote"
  | "add_quote_line"
  | "remove_quote_line"
  | "update_quote_line"
  | "apply_discount"
  | "create_product"
  | "update_product"
  | "set_product_price"
  | "add_bundle_component"
  | "remove_bundle_component"
  | "update_bundle_component";

export const protectedMutationActions: MutationAction[] = [
  "create_initial_quote",
  "create_renewal_quote",
  "submit_quote",
  "create_amendment_quote",
  "add_quote_line",
  "remove_quote_line",
  "update_quote_line",
  "apply_discount",
  "create_product",
  "update_product",
  "set_product_price",
  "add_bundle_component",
  "remove_bundle_component",
  "update_bundle_component",
];

export function isProtectedMutation(
  action: MutationAction,
  context: { discountDecision?: "permitted" | "approval_required" | "rejected" }
): boolean {
  if (
    action === "create_initial_quote" ||
    action === "create_renewal_quote" ||
    action === "submit_quote" ||
    action === "create_amendment_quote" ||
    action === "add_quote_line" ||
    action === "remove_quote_line" ||
    action === "update_quote_line" ||
    action === "create_product" || action === "update_product" || action === "set_product_price" ||
    action === "add_bundle_component" || action === "remove_bundle_component" || action === "update_bundle_component"
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
