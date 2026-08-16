import type { HelpAccordionGroup, HelpAccordionItem } from "./helpAccordion";

export type GlossaryTerm = HelpAccordionItem;
export type GlossaryGroup = HelpAccordionGroup;

export const GLOSSARY_INTRO = "Labels you'll see in Dime, in plain language.";

export const GLOSSARY_GROUPS: readonly GlossaryGroup[] = [
  {
    id: "money",
    title: "Money",
    terms: [
      {
        id: "debit",
        term: "Debit",
        description:
          "Money leaving your account. Dime shows these amounts in indigo.",
      },
      {
        id: "credit",
        term: "Credit",
        description: "Money coming in. Dime shows these amounts in green.",
      },
      {
        id: "transaction",
        term: "Transaction",
        description:
          "One debit or credit — from a bank SMS, a receipt, voice, or typing it in.",
      },
      {
        id: "amount",
        term: "Amount",
        description: "How much the transaction is worth, in rupees.",
      },
    ],
  },
  {
    id: "people",
    title: "People & places",
    terms: [
      {
        id: "payee",
        term: "Payee",
        description:
          "Who you paid, or who paid you. Dime groups similar names so charts stay clean.",
      },
      {
        id: "shop",
        term: "Shop",
        description: "A business or merchant payee.",
      },
      {
        id: "person",
        term: "Person",
        description: "Someone you sent money to, or received money from.",
      },
      {
        id: "transfer",
        term: "Transfer",
        description:
          "Money moved between your own accounts. Dime does not count this as spending.",
      },
      {
        id: "unknown",
        term: "Unknown",
        description:
          "A payee Dime could not classify yet. You can change this when you edit the transaction.",
      },
    ],
  },
  {
    id: "budgets",
    title: "Budgets",
    terms: [
      {
        id: "category",
        term: "Category",
        description: "A bucket for spending, such as Food or Transport.",
      },
      {
        id: "custom-category",
        term: "Custom category",
        description:
          "A category you created, with your own name, icon, and color.",
      },
      {
        id: "monthly-budget",
        term: "Monthly budget",
        description: "The cap you set for a month, overall or per category.",
      },
      {
        id: "daily-budget",
        term: "Daily budget",
        description: "A daily spending cap. Alerts can fire when you near it.",
      },
      {
        id: "remaining",
        term: "Remaining",
        description: "Budget minus what you have spent so far this period.",
      },
      {
        id: "overspend",
        term: "Overspend",
        description: "You went past the budget. Dime shows this in red.",
      },
    ],
  },
  {
    id: "capture",
    title: "Capture",
    terms: [
      {
        id: "automatic-capture",
        term: "Automatic capture",
        description:
          "Reading bank SMS on this phone so you can review them as expenses.",
      },
      {
        id: "bank-sms",
        term: "Bank SMS",
        description: "A bank text that may be a debit or credit.",
      },
      {
        id: "review-inbox",
        term: "Review inbox",
        description:
          "The list of SMS Dime found when you open the app. Keep, edit, or skip each one.",
      },
      {
        id: "receipt",
        term: "Receipt",
        description: "A photo Dime reads to fill in a transaction.",
      },
      {
        id: "voice",
        term: "Voice",
        description: "Speak an expense instead of typing it.",
      },
    ],
  },
  {
    id: "insights",
    title: "Insights",
    terms: [
      {
        id: "cash-flow",
        term: "Cash flow",
        description: "Daily expenses and income on a chart.",
      },
      {
        id: "net",
        term: "Net",
        description: "Income minus expenses for a period.",
      },
      {
        id: "compare-months",
        term: "Compare months",
        description: "Two months side by side so you can see what changed.",
      },
      {
        id: "payee-share",
        term: "Payee share",
        description:
          "How much of this month's spending went to one payee, as a percent.",
      },
      {
        id: "dime-ai",
        term: "Dime AI",
        description: "Chat where you can ask questions about your spending.",
      },
    ],
  },
  {
    id: "alerts",
    title: "Alerts",
    terms: [
      {
        id: "unread",
        term: "Unread",
        description: "A notification you have not opened yet.",
      },
      {
        id: "read",
        term: "Read",
        description: "A notification you have already opened.",
      },
      {
        id: "budget-alert",
        term: "Budget alert",
        description:
          "A notification when you hit a set percent of a budget, or go over.",
      },
      {
        id: "daily-reminder",
        term: "Daily expense reminder",
        description: "An evening nudge to log today's spending.",
      },
      {
        id: "transaction-added",
        term: "Transaction added",
        description:
          "A notification when Dime logs something from SMS, a scan, or voice.",
      },
      {
        id: "capture-failure",
        term: "Capture failure",
        description: "A notification when a receipt scan could not be read.",
      },
    ],
  },
];
