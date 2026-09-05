export type ChatMessage = { role: "user" | "agent"; text: string };
export type TraceBadge = "READ" | "WRITE" | "GATE";
export type TraceEntry = { tool: string; badge: TraceBadge; durationMs: number; blocked: boolean; summary: string };
export type ConfirmationCardData = {
  title: string;
  lines: string[];
  confirmLabel: string;
  cancelLabel: string;
};
export type ConversationFlow = {
  id: string;
  starterPrompt: string;
  messages: ChatMessage[];
  preConfirmationTrace: TraceEntry[];
  postConfirmationTrace: TraceEntry[];
  confirmation: ConfirmationCardData | null;
  afterConfirmMessage: string | null;
};

export const conversationFlows: ConversationFlow[] = [
  {
    id: "acme-renewal",
    starterPrompt: "Renew Acme University for 3 years and increase Cloud Pro to 250 seats.",
    messages: [
      { role: "user", text: "Renew Acme University for 3 years and increase Cloud Pro to 250 seats." },
      {
        role: "agent",
        text: "I found Acme University. They currently have 100 Cloud Pro seats. I can propose a renewal for 250 Cloud Pro seats over a 36-month term, and their existing 12% discount will be preserved.",
      },
    ],
    preConfirmationTrace: [
      { tool: "find_account", badge: "READ", durationMs: 110, blocked: false, summary: "Acme University found" },
      { tool: "get_account_assets", badge: "READ", durationMs: 180, blocked: false, summary: "Existing 100 Cloud Pro seats found" },
      { tool: "search_products", badge: "READ", durationMs: 90, blocked: false, summary: "Cloud Pro located" },
    ],
    postConfirmationTrace: [
      { tool: "create_renewal_quote", badge: "WRITE", durationMs: 480, blocked: false, summary: "Quote Q-10452 created" },
    ],
    confirmation: {
      title: "Ready to create renewal quote",
      lines: ["Account: Acme University", "Term: 36 months", "Cloud Pro: 250 seats", "Discount: 12%"],
      confirmLabel: "Create renewal",
      cancelLabel: "Cancel",
    },
    afterConfirmMessage: "Renewal quote Q-10452 created for Acme University. 250 Cloud Pro seats at the preserved 12% discount, 36-month term.",
  },
  {
    id: "greenfield-initial",
    starterPrompt: "Create an initial quote for Greenfield Health with 75 Cloud Pro seats.",
    messages: [
      { role: "user", text: "Create an initial quote for Greenfield Health with 75 Cloud Pro seats." },
      {
        role: "agent",
        text: "I found Greenfield Health. They are a new customer with no existing assets. I can create an initial quote for 75 Cloud Pro seats.",
      },
    ],
    preConfirmationTrace: [
      { tool: "find_account", badge: "READ", durationMs: 105, blocked: false, summary: "Greenfield Health found" },
      { tool: "search_products", badge: "READ", durationMs: 95, blocked: false, summary: "Cloud Pro located" },
    ],
    postConfirmationTrace: [
      { tool: "create_initial_quote", badge: "WRITE", durationMs: 460, blocked: false, summary: "Quote Q-10453 created" },
    ],
    confirmation: {
      title: "Ready to create initial quote",
      lines: ["Account: Greenfield Health", "Cloud Pro: 75 seats"],
      confirmLabel: "Create quote",
      cancelLabel: "Cancel",
    },
    afterConfirmMessage: "Initial quote Q-10453 created for Greenfield Health with 75 Cloud Pro seats.",
  },
  {
    id: "acme-discount-20",
    starterPrompt: "Give Acme University a 20% discount.",
    messages: [
      { role: "user", text: "Give Acme University a 20% discount." },
      {
        role: "agent",
        text: "I found Acme University. A 20% discount exceeds the 15% self-serve threshold, so it requires manager approval before it can be applied.",
      },
    ],
    preConfirmationTrace: [
      { tool: "find_account", badge: "READ", durationMs: 100, blocked: false, summary: "Acme University found" },
      { tool: "apply_discount", badge: "GATE", durationMs: 5, blocked: true, summary: "Manager approval required" },
    ],
    postConfirmationTrace: [],
    confirmation: {
      title: "Manager approval required",
      lines: ["Account: Acme University", "Requested discount: 20%", "Policy threshold: 15% (self-serve)"],
      confirmLabel: "Request approval",
      cancelLabel: "Cancel",
    },
    afterConfirmMessage: "Approval request sent for Acme University's 20% discount. You'll be notified once a manager responds.",
  },
  {
    id: "acme-discount-30",
    starterPrompt: "Try to give Acme University a 30% discount.",
    messages: [
      { role: "user", text: "Try to give Acme University a 30% discount." },
      {
        role: "agent",
        text: "I found Acme University. A 30% discount exceeds the maximum permitted discount of 25% and has been rejected outright. No approval path exists for this amount.",
      },
    ],
    preConfirmationTrace: [
      { tool: "find_account", badge: "READ", durationMs: 98, blocked: false, summary: "Acme University found" },
      { tool: "apply_discount", badge: "GATE", durationMs: 4, blocked: true, summary: "Rejected: exceeds 25% maximum" },
    ],
    postConfirmationTrace: [],
    confirmation: null,
    afterConfirmMessage: null,
  },
];
