import {
  BedDouble,
  Clapperboard,
  House,
  Lightbulb,
  Plane,
  Receipt,
  Repeat,
  ShoppingBag,
  ShoppingBasket,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

/** PRD › Expenses › Categories (same list as the expenses.category check constraint). */
export const CATEGORIES = [
  "food",
  "travel",
  "stay",
  "groceries",
  "rent",
  "utilities",
  "entertainment",
  "shopping",
  "subscriptions",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_META: Record<Category, { label: string; Icon: LucideIcon }> = {
  food: { label: "Food", Icon: UtensilsCrossed },
  travel: { label: "Travel", Icon: Plane },
  stay: { label: "Stay", Icon: BedDouble },
  groceries: { label: "Groceries", Icon: ShoppingBasket },
  rent: { label: "Rent", Icon: House },
  utilities: { label: "Utilities", Icon: Lightbulb },
  entertainment: { label: "Entertainment", Icon: Clapperboard },
  shopping: { label: "Shopping", Icon: ShoppingBag },
  subscriptions: { label: "Subscriptions", Icon: Repeat },
  other: { label: "Other", Icon: Receipt },
};

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}
