import { and, desc, eq, inArray } from "drizzle-orm";
import { Router } from "express";
import {
  CreateEvidencePackageBody,
  CreateEvidencePackageResponse,
  GetEvidencePackageParams,
  GetEvidencePackageResponse,
  ListEvidencePackagesResponse,
} from "@workspace/api-zod";
import {
  db,
  evidencePackagesTable,
  intelligenceRecordsTable,
} from "@workspace/db";
import { logActivity } from "../lib/audit";
import { openai } from "../lib/openai";
import { requireRole } from "./auth";

const router = Router();
const canGenerate = requireRole("Admin", "Senior Surveyor", "Junior Surveyor");

function toApiPackage(item: typeof evidencePackagesTable.$inferSelect) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
  };
}

async function generateCommentary(
  subjectProperty: string,
  records: (typeof intelligenceRecordsTable.$inferSelect)[],
): Promise<string> {
  const comparisons = records.map((record) => ({
    category: record.category,
    title: record.title,
    location: record.location,
    propertyType: record.propertyType,
    observedAt: record.observedAt.toISOString(),
    details: record.details,
  }));
  const result = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "Write concise professional comparable-evidence commentary for an estate surveyor. Use only the supplied subject and verified records. Do not invent values, make a final valuation, or hide differences and limitations. Explain relevance and note when evidence is not directly comparable.",
      },
      {
        role: "user",
        content: JSON.stringify({ subjectProperty, comparables: comparisons }),
      },
    ],
  });
  const content = result.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("The commentary service returned no text.");
  }
  return content;
}

router.get(
  "/evidence-packages",
  async (_req, res): Promise<void> => {
    const packages = await db
      .select()
      .from(evidencePackagesTable)
      .orderBy(desc(evidencePackagesTable.createdAt))
      .limit(100);
    res.json(ListEvidencePackagesResponse.parse(packages.map(toApiPackage)));
  },
);

router.post(
  "/evidence-packages",
  canGenerate,
  async (req, res): Promise<void> => {
    const parsed = CreateEvidencePackageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Enter a title, subject, and comparable records." });
      return;
    }
    const uniqueIds = Array.from(new Set(parsed.data.recordIds));
    const records = await db
      .select()
      .from(intelligenceRecordsTable)
      .where(
        and(
          inArray(intelligenceRecordsTable.id, uniqueIds),
          eq(intelligenceRecordsTable.status, "confirmed"),
        ),
      );
    if (records.length !== uniqueIds.length) {
      res.status(400).json({
        error: "Choose existing, confirmed records for the evidence package.",
      });
      return;
    }

    let commentary = parsed.data.commentary?.trim();
    if (!commentary) {
      try {
        commentary = await generateCommentary(
          parsed.data.subjectProperty,
          records,
        );
      } catch (error) {
        req.log.error({ err: error }, "PIS evidence commentary generation failed");
        res.status(502).json({ error: "Unable to generate evidence commentary." });
        return;
      }
    }

    const [item] = await db
      .insert(evidencePackagesTable)
      .values({
        title: parsed.data.title,
        subjectProperty: parsed.data.subjectProperty,
        recordIds: uniqueIds,
        commentary,
        createdBy: req.pisUser!.id,
      })
      .returning();
    await logActivity(
      "evidence_package_created",
      "evidence",
      `Generated "${item.title}" using ${records.length} confirmed comparables.`,
      req.pisUser!.fullName,
    );
    res
      .status(201)
      .json(CreateEvidencePackageResponse.parse(toApiPackage(item)));
  },
);

router.get(
  "/evidence-packages/:packageId",
  async (req, res): Promise<void> => {
    const params = GetEvidencePackageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid package ID." });
      return;
    }
    const [item] = await db
      .select()
      .from(evidencePackagesTable)
      .where(eq(evidencePackagesTable.id, params.data.packageId))
      .limit(1);
    if (!item) {
      res.status(404).json({ error: "Evidence package not found." });
      return;
    }
    res.json(GetEvidencePackageResponse.parse(toApiPackage(item)));
  },
);

export default router;
