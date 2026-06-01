import { Model } from "@nozbe/watermelondb";
import { field, text } from "@nozbe/watermelondb/decorators";

/** System and custom categories synced from ``public.categories``. */
export class Category extends Model {
  static table = "categories";

  @text("name") name!: string;
  @text("icon_name") iconName!: string;
  @text("color") color!: string;
  @field("is_system") isSystem!: boolean;
  @text("user_id") userId!: string | null;
  @field("created_at") createdAt!: number;
}
