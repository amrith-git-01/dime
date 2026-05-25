export type CategoryRow = {
  id: string;
  name: string;
  icon_name: string;
  color: string;
  is_system: boolean;
  created_at: string;
  user_id?: string | null;
};

export type CreateCategoryPayload = {
  name: string;
  icon_name?: string;
  color?: string;
};
