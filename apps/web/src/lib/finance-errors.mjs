export function formatFinanceErrorMessage(message) {
  const raw = typeof message === "string" ? message : message ? String(message) : "";
  const normalized = raw.trim();
  const lower = normalized.toLowerCase();

  if (!lower) return "Something went wrong.";
  if (lower.includes("unauthorized")) return "Please sign in to continue.";
  if (lower.includes("forbidden") || lower.includes("permission")) {
    return "You do not have permission to complete this action.";
  }

  if (lower.includes("funding_request_not_ready_for_vote")) {
    return "That funding request must be scheduled for vote before you can record a board vote.";
  }

  if (lower.includes("meeting_not_found")) return "Meeting not found.";
  if (lower.includes("funding_request_not_found")) return "Funding request not found.";
  if (lower.includes("motion_required")) return "Motion text is required.";
  if (lower.includes("invalid_votes")) return "Vote counts must be 0 or higher.";

  if (lower.includes("payee_required")) return "Payee is required.";
  if (lower.includes("amount_required")) return "Amount must be greater than 0.";
  if (lower.includes("purchased_at_required")) return "Purchased date/time is required.";
  if (lower.includes("receipt_doc_not_found")) return "Receipt document not found.";
  if (lower.includes("invalid_receipt_doc_type")) return "Receipt document must be a receipt.";

  return normalized;
}

