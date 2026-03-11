export type Todo = {
  id: number;
  title: string;
  due_date: string | null;
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
