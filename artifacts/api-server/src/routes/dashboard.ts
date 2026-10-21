import { count, desc, eq } from "drizzle-orm";
import { Router } from "express";
import {
  GetDashboardResponse,
  ListActivityResponse,
} from "@workspace/api-zod";
import {
  activityLogsTable,
  db,
  intakeDocumentsTable,
  intelligenceRecordsTable,
} from "@workspace/db";
import { toActivityEntry } from "../lib/audit";

const router = Router();

router.get("/dashboard", async (_req, res): Promise<void> => {
  const [
    valuations,
    constructionCosts,
    housingRecords,
    pendingDocuments,
    pendingRecords,
    confirmedRecords,
    recentRows,
  ] = await Promise.all([
    db
      .select({ count: count() })
      .from(intelligenceRecordsTable)
      .where(eq(intelligenceRecordsTable.category, "valuation")),
    db
      .select({ count: count() })
      .from(intelligenceRecordsTable)
      .where(eq(intelligenceRecordsTable.category, "construction")),
    db
      .select({ count: count() })
      .from(intelligenceRecordsTable)
      .where(eq(intelligenceRecordsTable.category, "housing")),
    db
      .select({ count: count() })
      .from(intakeDocumentsTable)
      .where(eq(intakeDocumentsTable.status, "pending_review")),
    db
      .select({ count: count() })
      .from(intelligenceRecordsTable)
      .where(eq(intelligenceRecordsTable.status, "pending")),
    db
      .select({ count: count() })
      .from(intelligenceRecordsTable)
      .where(eq(intelligenceRecordsTable.status, "confirmed")),
    db
      .select()
      .from(activityLogsTable)
      .orderBy(desc(activityLogsTable.createdAt))
      .limit(8),
  ]);

  res.json(
    GetDashboardResponse.parse({
      valuations: Number(valuations[0]?.count ?? 0),
      constructionCosts: Number(constructionCosts[0]?.count ?? 0),
      housingRecords: Number(housingRecords[0]?.count ?? 0),
      pendingReviews:
        Number(pendingDocuments[0]?.count ?? 0) +
        Number(pendingRecords[0]?.count ?? 0),
      confirmedRecords: Number(confirmedRecords[0]?.count ?? 0),
      recentActivity: recentRows.map(toActivityEntry),
    }),
  );
});

router.get("/activity", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(activityLogsTable)
    .orderBy(desc(activityLogsTable.createdAt))
    .limit(100);
  res.json(ListActivityResponse.parse(rows.map(toActivityEntry)));
});

export default router;
