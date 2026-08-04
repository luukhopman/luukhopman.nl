export const TODO_REMINDER_SETTINGS = [
  "default",
  "off",
  "15m",
  "30m",
  "1h",
  "2h",
  "1d",
  "1w",
  "at_due_time",
  "previous_evening",
] as const;

export type TodoReminderSetting = (typeof TODO_REMINDER_SETTINGS)[number];

export function isTodoReminderSetting(value: unknown): value is TodoReminderSetting {
  return typeof value === "string" && TODO_REMINDER_SETTINGS.includes(value as TodoReminderSetting);
}

export type Todo = {
  id: number;
  title: string;
  due_date: string | null;
  due_time: string | null;
  reminder_setting: TodoReminderSetting;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
};

export type Product = {
  id: number;
  name: string;
  store: string | null;
  url: string | null;
  acquired: boolean;
  is_deleted: boolean;
  acquired_at: string | null;
  deleted_at: string | null;
  created_at: string;
  sort_order: number;
};

export type Recipe = {
  id: number;
  share_token: string;
  title: string | null;
  course: string | null;
  url: string | null;
  ingredients: string | null;
  instructions: string | null;
  notes: string | null;
  created_at: string;
};

export type GiftIdea = {
  id: number;
  recipient_name: string;
  title: string;
  url: string | null;
  notes: string | null;
  purchased: boolean;
  created_at: string;
};

export type ImportIngredientsResult = {
  added: number;
  skipped: number;
};

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type MealPlanEntry = {
  id: number;
  meal_date: string;
  meal_type: MealType;
  recipe_id: number | null;
  recipe_title: string | null;
  recipe_share_token: string | null;
  title: string | null;
  created_at: string;
};

export type ReusableListItem = {
  id: number;
  list_id: number;
  title: string;
  checked: boolean;
  sort_order: number;
  created_at: string;
};

export type ReusableList = {
  id: number;
  name: string;
  completed: boolean;
  is_template: boolean;
  created_at: string;
  items: ReusableListItem[];
};

export type HarvestUnit = "count" | "kg";

export type HarvestUnitTotals = Record<HarvestUnit, number>;

export type HarvestVegetable = {
  id: number;
  name: string;
  unit: HarvestUnit;
  total: number;
  created_at: string;
};

export type HarvestEntry = {
  id: number;
  vegetable_id: number;
  vegetable_name: string;
  quantity: number;
  unit: HarvestUnit;
  harvested_on: string;
  created_at: string;
};

export type HarvestCountData = {
  vegetables: HarvestVegetable[];
  recent: HarvestEntry[];
  total: HarvestUnitTotals;
  today: HarvestUnitTotals;
};
