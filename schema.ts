import { sql } from "drizzle-orm";
import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";

export const triggers = sqliteTable("triggers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  identity: text("trigger_identity").notNull().unique(),
  direction: text("direction").notNull(),
  threshold: integer("threshold").notNull(),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  identity: text("identity").notNull(),
  triggeredAt: integer("triggered_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
