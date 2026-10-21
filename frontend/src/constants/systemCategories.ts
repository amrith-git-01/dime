/**
 * A few of the system categories the API seeds (ids, icons and colors match
 * `api/migrations/0001_init.sql` and `0007_recurring_categories.sql`). System ids are the same for
 * every account, so the guided tour's sample data can use them and render real icons even when the
 * categories list is not cached.
 */
export type SeededSystemCategory = {
  id: string;
  name: string;
  icon_name: string;
  color: string;
  scope: "spend" | "recurring_expense" | "recurring_income";
};

export const SEEDED_SYSTEM_CATEGORIES = {
  food: {
    id: "85bf877a-f8b1-4b07-a9fb-5e8c809907ae",
    name: "Food & Dining",
    icon_name: "UtensilsCrossed",
    color: "#FF6B6B",
    scope: "spend",
  },
  shopping: {
    id: "a50ff903-ea00-404a-a3a4-d99c96899de5",
    name: "Shopping",
    icon_name: "ShoppingBag",
    color: "#A855F7",
    scope: "spend",
  },
  transport: {
    id: "533e41b7-e8cf-42bc-95db-35b793b9f1f4",
    name: "Transport",
    icon_name: "Car",
    color: "#4ECDC4",
    scope: "spend",
  },
  health: {
    id: "a00eb2e0-48a8-47f1-98cb-3a30b8731501",
    name: "Health",
    icon_name: "HeartPulse",
    color: "#4ADE80",
    scope: "spend",
  },
  rent: {
    id: "94b82777-eee4-46de-8c18-7490bda02b60",
    name: "Rent",
    icon_name: "House",
    color: "#38BDF8",
    scope: "recurring_expense",
  },
  internet: {
    id: "2f223b6a-f43d-4acb-ae01-a458fea3ef3e",
    name: "Internet & phone",
    icon_name: "Wifi",
    color: "#22D3EE",
    scope: "recurring_expense",
  },
  subscriptions: {
    id: "5ff58423-93ee-4a03-8163-54e99032ca7a",
    name: "Subscriptions",
    icon_name: "Repeat",
    color: "#A78BFA",
    scope: "recurring_expense",
  },
  salary: {
    id: "f48bfe4a-8f08-4229-b977-e1292b11490f",
    name: "Salary",
    icon_name: "Briefcase",
    color: "#34D399",
    scope: "recurring_income",
  },
} as const satisfies Record<string, SeededSystemCategory>;
