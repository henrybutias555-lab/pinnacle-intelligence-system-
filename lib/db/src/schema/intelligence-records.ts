import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const intelligenceRecordsTable = pgTable("intelligence_records", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  title: text("title"),
  location: text("location").notNull(),
  propertyType: text("property_type"),
  observedAt: timestamp("observed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  status: text("status").notNull().default("pending"),
  sourceName: text("source_name"),
  details: jsonb("details")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertIntelligenceRecordSchema = createInsertSchema(
  intelligenceRecordsTable,
);
export type InsertIntelligenceRecord = z.infer<
  typeof insertIntelligenceRecordSchema
>;
export type IntelligenceRecord = typeof intelligenceRecordsTable.$inferSelect;
