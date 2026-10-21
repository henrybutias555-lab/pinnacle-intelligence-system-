import { and, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { Router } from "express";
import {
  ConfirmRecordParams,
  ConfirmRecordResponse,
  CreateRecordBody,
  CreateRecordResponse,
  GetRecordParams,
  GetRecordResponse,
  ListRecordsQueryParams,
  ListRecordsResponse,
  UpdateRecordBody,
  UpdateRecordParams,
  UpdateRecordResponse,
} from "@workspace/api-zod";
import { db, intelligenceRecordsTable } from "@workspace/db";
import { logActivity } from "../lib/audit";
import { requireRole } from "./auth";

const router = Router();
const canEdit = requireRole("Admin", "Senior Surveyor", "Junior Surveyor");
const canConfirm = requireRole("Admin", "Senior Surveyor");

function toApiRecord(record: typeof intelligenceRecordsTable.$inferSelect) {
  return {
    ...record,
    observedAt: record.observedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

router.get("/records", async (req, res): Promise<void> => {
  const parsed = ListRecordsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid record filters." });
    return;
  }

  const filters = [];
  if (parsed.data.category) {
    filters.push(eq(intelligenceRecordsTable.category, parsed.data.category));
  }
  if (parsed.data.location) {
    filters.push(
      ilike(intelligenceRecordsTable.location, `%${parsed.data.location}%`),
    );
  }
  if (parsed.data.propertyType) {
    filters.push(
      ilike(
        intelligenceRecordsTable.propertyType,
        `%${parsed.data.propertyType}%`,
      ),
    );
  }
  if (parsed.data.status) {
    filters.push(eq(intelligenceRecordsTable.status, parsed.data.status));
  }
  if (parsed.data.dateFrom) {
    filters.push(
      gte(
        intelligenceRecordsTable.observedAt,
        new Date(`${parsed.data.dateFrom}T00:00:00.000Z`),
      ),
    );
  }
  if (parsed.data.dateTo) {
    filters.push(
      lte(
        intelligenceRecordsTable.observedAt,
        new Date(`${parsed.data.dateTo}T23:59:59.999Z`),
      ),
    );
  }

  const rows = await db
    .select()
    .from(intelligenceRecordsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(intelligenceRecordsTable.observedAt))
    .limit(250);
  res.json(ListRecordsResponse.parse(rows.map(toApiRecord)));
});

router.post(
  "/records",
  canEdit,
  async (req, res): Promise<void> => {
    const parsed = CreateRecordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter the required record details." });
      return;
    }
    const [record] = await db
      .insert(intelligenceRecordsTable)
      .values({
        category: parsed.data.category,
        title: parsed.data.title ?? null,
        location: parsed.data.location,
        propertyType: parsed.data.propertyType ?? null,
        observedAt: parsed.data.observedAt
          ? new Date(parsed.data.observedAt)
          : new Date(),
        status: "pending",
        sourceName: parsed.data.sourceName ?? null,
        details: parsed.data.details,
        createdBy: req.pisUser!.id,
      })
      .returning();
    await logActivity(
      "record_created",
      "record",
      `Added pending ${record.category} evidence for ${record.location}.`,
      req.pisUser!.fullName,
    );
    res.status(201).json(CreateRecordResponse.parse(toApiRecord(record)));
  },
);

router.get("/records/:recordId", async (req, res): Promise<void> => {
  const params = GetRecordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid record ID." });
    return;
  }
  const [record] = await db
    .select()
    .from(intelligenceRecordsTable)
    .where(eq(intelligenceRecordsTable.id, params.data.recordId))
    .limit(1);
  if (!record) {
    res.status(404).json({ error: "Record not found." });
    return;
  }
  res.json(GetRecordResponse.parse(toApiRecord(record)));
});

router.patch(
  "/records/:recordId",
  canEdit,
  async (req, res): Promise<void> => {
    const params = UpdateRecordParams.safeParse(req.params);
    const parsed = UpdateRecordBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid record update." });
      return;
    }

    const [existing] = await db
      .select()
      .from(intelligenceRecordsTable)
      .where(eq(intelligenceRecordsTable.id, params.data.recordId))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Record not found." });
      return;
    }
    if (
      req.pisUser!.role === "Junior Surveyor" &&
      existing.status !== "pending"
    ) {
      res.status(403).json({ error: "Junior Surveyors can edit pending records only." });
      return;
    }

    const update = {
      ...parsed.data,
      ...(parsed.data.observedAt
        ? { observedAt: new Date(parsed.data.observedAt) }
        : {}),
    };
    const [record] = await db
      .update(intelligenceRecordsTable)
      .set(update)
      .where(eq(intelligenceRecordsTable.id, params.data.recordId))
      .returning();
    await logActivity(
      "record_updated",
      "record",
      `Updated ${record.category} evidence for ${record.location}.`,
      req.pisUser!.fullName,
    );
    res.json(UpdateRecordResponse.parse(toApiRecord(record)));
  },
);

router.post(
  "/records/:recordId/confirm",
  canConfirm,
  async (req, res): Promise<void> => {
    const params = ConfirmRecordParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid record ID." });
      return;
    }
    const [record] = await db
      .update(intelligenceRecordsTable)
      .set({ status: "confirmed" })
      .where(eq(intelligenceRecordsTable.id, params.data.recordId))
      .returning();
    if (!record) {
      res.status(404).json({ error: "Record not found." });
      return;
    }
    await logActivity(
      "record_confirmed",
      "record",
      `Confirmed ${record.category} evidence for ${record.location}.`,
      req.pisUser!.fullName,
    );
    res.json(ConfirmRecordResponse.parse(toApiRecord(record)));
  },
);

export default router;
