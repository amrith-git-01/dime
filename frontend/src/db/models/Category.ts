import { Model } from "@nozbe/watermelondb";
import { field, text } from "@nozbe/watermelondb/decorators";

export class Category extends Model {
  static table = "categories";

  @text("name") name!: string;
  @text("emoji") emoji!: string;
  @text("color") color!: string;
  @field("is_system") isSystem!: boolean;
  @field("created_at") createdAt!: number;
}
