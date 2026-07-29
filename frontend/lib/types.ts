export type Todo = {
  id: number;
  title: string;
  due_date: string | null;
  due_time: string | null;
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
  archived: boolean;
  created_at: string;
  items: ReusableListItem[];
};
