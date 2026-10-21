import { createInsertSchema } from "drizzle-zod";
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const evidencePackagesTable = pgTable("evidence_packages", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  subjectProperty: text("subject_property").notNull(),
  recordIds: integer("record_ids").array().notNull().default([]),
  commentary: text("commentary").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertEvidencePackageSchema = createInsertSchema(
  evidencePackagesTable,
);
export type InsertEvidencePackage = z.infer<
  typeof insertEvidencePackageSchema
>;
export type EvidencePackage = typeof evidencePackagesTable.$inferSelect;
