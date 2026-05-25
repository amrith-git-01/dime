import { Model } from "@nozbe/watermelondb";
import { field, text } from "@nozbe/watermelondb/decorators";

export class UserCategory extends Model {
  static table = "user_categories";

  @text("user_id") userId!: string;
  @text("name") name!: string;
  @text("icon_name") iconName!: string;
  @text("color") color!: string;
  @field("created_at") createdAt!: number;
}
