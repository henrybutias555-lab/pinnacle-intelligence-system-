import { createInsertSchema } from "drizzle-zod";
import {
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const intakeDocumentsTable = pgTable("intake_documents", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  objectPath: text("object_path").notNull(),
  category: text("category").notNull(),
  status: text("status").notNull().default("pending_review"),
  extractedData: jsonb("extracted_data")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  uploadedBy: text("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertIntakeDocumentSchema = createInsertSchema(
  intakeDocumentsTable,
);
export type InsertIntakeDocument = z.infer<typeof insertIntakeDocumentSchema>;
export type IntakeDocument = typeof intakeDocumentsTable.$inferSelect;
