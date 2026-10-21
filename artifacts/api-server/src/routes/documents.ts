import { and, desc, eq } from "drizzle-orm";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { Router } from "express";
import {
  ApproveDocumentBody,
  ApproveDocumentParams,
  ApproveDocumentResponse,
  IngestDocumentBody,
  IngestDocumentResponse,
  ListDocumentsQueryParams,
  ListDocumentsResponse,
  UpdateDocumentReviewBody,
  UpdateDocumentReviewParams,
  UpdateDocumentReviewResponse,
} from "@workspace/api-zod";
import {
  db,
  intakeDocumentsTable,
  intelligenceRecordsTable,
} from "@workspace/db";
import { logActivity } from "../lib/audit";
import { openai } from "../lib/openai";
import { ObjectStorageService } from "../lib/objectStorage";
import { requireRole } from "./auth";

const router = Router();
const storage = new ObjectStorageService();
const canReview = requireRole("Admin", "Senior Surveyor", "Junior Surveyor");
const canApprove = requireRole("Admin", "Senior Surveyor");
const extractionSchemas = {
  valuation: {
    type: "object",
    additionalProperties: false,
    required: [
      "location",
      "propertyType",
      "capitalValue",
      "rentalValue",
      "yieldPercent",
      "valuationMethod",
      "assumptions",
      "comparableEvidenceNotes",
    ],
    properties: {
      location: { type: ["string", "null"] },
      propertyType: { type: ["string", "null"] },
      capitalValue: { type: ["number", "null"] },
      rentalValue: { type: ["number", "null"] },
      yieldPercent: { type: ["number", "null"] },
      valuationMethod: { type: ["string", "null"] },
      assumptions: { type: "array", items: { type: "string" } },
      comparableEvidenceNotes: { type: ["string", "null"] },
    },
  },
  construction: {
    type: "object",
    additionalProperties: false,
    required: [
      "location",
      "propertyType",
      "costPerSqm",
      "costPerSqft",
      "breakdown",
      "costIndices",
    ],
    properties: {
      location: { type: ["string", "null"] },
      propertyType: { type: ["string", "null"] },
      costPerSqm: { type: ["number", "null"] },
      costPerSqft: { type: ["number", "null"] },
      breakdown: {
        type: "object",
        additionalProperties: false,
        required: ["structure", "finishes", "externalWorks", "preliminaries"],
        properties: {
          structure: { type: ["number", "null"] },
          finishes: { type: ["number", "null"] },
          externalWorks: { type: ["number", "null"] },
          preliminaries: { type: ["number", "null"] },
        },
      },
      costIndices: {
        type: "object",
        additionalProperties: false,
        required: ["baseDate", "index", "notes"],
        properties: {
          baseDate: { type: ["string", "null"] },
          index: { type: ["number", "null"] },
          notes: { type: ["string", "null"] },
        },
      },
    },
  },
  housing: {
    type: "object",
    additionalProperties: false,
    required: [
      "area",
      "residentialPricingTrends",
      "supplyDemandIndicators",
      "stockDetails",
    ],
    properties: {
      area: { type: ["string", "null"] },
      residentialPricingTrends: { type: ["string", "null"] },
      supplyDemandIndicators: { type: ["string", "null"] },
      stockDetails: { type: ["string", "null"] },
    },
  },
} as const;

async function extractText(
  objectPath: string,
  fileName: string,
): Promise<string> {
  const objectFile = await storage.getObjectEntityFile(objectPath);
  const [metadata] = await objectFile.getMetadata();
  if (Number(metadata.size ?? 0) > 25 * 1024 * 1024) {
    throw new Error("Uploaded document exceeds the 25 MB processing limit.");
  }
  const [buffer] = await objectFile.download();
  const extension = fileName.toLocaleLowerCase().split(".").pop();
  let text = "";
  if (extension === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      text = parsed.text;
    } finally {
      await parser.destroy();
    }
  } else if (extension === "docx") {
    const parsed = await mammoth.extractRawText({ buffer });
    text = parsed.value;
  } else {
    throw new Error("Only PDF and DOCX files are supported.");
  }
  const normalized = text.replace(/\u0000/g, "").trim();
  if (!normalized) {
    throw new Error("No readable text was found in the uploaded document.");
  }
  return normalized.slice(0, 65_000);
}

async function extractFields(
  category: "valuation" | "construction" | "housing",
  sourceText: string,
): Promise<Record<string, unknown>> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: `${category}_report_extraction`,
        strict: true,
        schema: extractionSchemas[category],
      },
    },
    messages: [
      {
        role: "system",
        content:
          "Extract property-survey information from the source text. Do not infer or invent facts. Use null when a scalar value is not stated and an empty array for missing list fields. Preserve source units and currency in notes when relevant.",
      },
      {
        role: "user",
        content: `Category: ${category}\nSource report text:\n${sourceText}`,
      },
    ],
  });
  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("The extraction service returned no structured fields.");
  }
  const result: unknown = JSON.parse(content);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("The extraction service returned an invalid result.");
  }
  return result as Record<string, unknown>;
}

function toApiDocument(document: typeof intakeDocumentsTable.$inferSelect) {
  return {
    ...document,
    createdAt: document.createdAt.toISOString(),
  };
}

function toApiRecord(record: typeof intelligenceRecordsTable.$inferSelect) {
  return {
    ...record,
    observedAt: record.observedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}

router.get("/documents", async (req, res): Promise<void> => {
  const query = ListDocumentsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid document filter." });
    return;
  }

  const rows = await db
    .select()
    .from(intakeDocumentsTable)
    .where(
      query.data.status
        ? eq(intakeDocumentsTable.status, query.data.status)
        : undefined,
    )
    .orderBy(desc(intakeDocumentsTable.createdAt))
    .limit(100);
  res.json(ListDocumentsResponse.parse(rows.map(toApiDocument)));
});

router.post(
  "/ingest",
  canReview,
  async (req, res): Promise<void> => {
    const parsed = IngestDocumentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid document upload details." });
      return;
    }
    if (!parsed.data.objectPath.startsWith("/objects/uploads/")) {
      res.status(400).json({ error: "Document path is not a private upload." });
      return;
    }
    const extension = parsed.data.fileName.toLocaleLowerCase().split(".").pop();
    if (extension !== "pdf" && extension !== "docx") {
      res.status(400).json({ error: "Only PDF and DOCX files are supported." });
      return;
    }

    let extractedData: Record<string, unknown>;
    try {
      const text = await extractText(
        parsed.data.objectPath,
        parsed.data.fileName,
      );
      extractedData = await extractFields(parsed.data.category, text);
    } catch (error) {
      req.log.error({ err: error }, "PIS document extraction failed");
      const message =
        error instanceof Error
          ? error.message
          : "Unable to extract data from this file.";
      res.status(422).json({ error: message });
      return;
    }

    const [document] = await db
      .insert(intakeDocumentsTable)
      .values({
        fileName: parsed.data.fileName,
        objectPath: parsed.data.objectPath,
        category: parsed.data.category,
        status: "pending_review",
        extractedData,
        uploadedBy: req.pisUser!.id,
      })
      .returning();
    await logActivity(
      "document_ingested",
      "document",
      `Extracted ${parsed.data.category} fields from ${parsed.data.fileName} for review.`,
      req.pisUser!.fullName,
    );
    res
      .status(201)
      .json(IngestDocumentResponse.parse(toApiDocument(document)));
  },
);

router.patch(
  "/documents/:documentId",
  canReview,
  async (req, res): Promise<void> => {
    const params = UpdateDocumentReviewParams.safeParse(req.params);
    const parsed = UpdateDocumentReviewBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid document review update." });
      return;
    }
    const [document] = await db
      .update(intakeDocumentsTable)
      .set({ extractedData: parsed.data.extractedData })
      .where(
        and(
          eq(intakeDocumentsTable.id, params.data.documentId),
          eq(intakeDocumentsTable.status, "pending_review"),
        ),
      )
      .returning();
    if (!document) {
      res.status(404).json({ error: "Pending document not found." });
      return;
    }
    await logActivity(
      "document_review_saved",
      "document",
      `Saved human edits to ${document.fileName}.`,
      req.pisUser!.fullName,
    );
    res.json(UpdateDocumentReviewResponse.parse(toApiDocument(document)));
  },
);

router.post(
  "/documents/:documentId/approve",
  canApprove,
  async (req, res): Promise<void> => {
    const params = ApproveDocumentParams.safeParse(req.params);
    const parsed = ApproveDocumentBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Invalid approved record details." });
      return;
    }
    const [document] = await db
      .select()
      .from(intakeDocumentsTable)
      .where(
        and(
          eq(intakeDocumentsTable.id, params.data.documentId),
          eq(intakeDocumentsTable.status, "pending_review"),
        ),
      )
      .limit(1);
    if (!document) {
      res.status(404).json({ error: "Pending document not found." });
      return;
    }

    const [record] = await db
      .insert(intelligenceRecordsTable)
      .values({
        category: parsed.data.category,
        title: parsed.data.title ?? document.fileName,
        location: parsed.data.location,
        propertyType: parsed.data.propertyType ?? null,
        observedAt: parsed.data.observedAt
          ? new Date(parsed.data.observedAt)
          : new Date(),
        status: "confirmed",
        sourceName: parsed.data.sourceName ?? document.fileName,
        details: parsed.data.details,
        createdBy: req.pisUser!.id,
      })
      .returning();
    await db
      .update(intakeDocumentsTable)
      .set({ status: "approved" })
      .where(eq(intakeDocumentsTable.id, document.id));
    await logActivity(
      "document_approved",
      "document",
      `Approved ${document.fileName} and created confirmed ${record.category} evidence.`,
      req.pisUser!.fullName,
    );
    res
      .status(201)
      .json(ApproveDocumentResponse.parse(toApiRecord(record)));
  },
);

export default router;
