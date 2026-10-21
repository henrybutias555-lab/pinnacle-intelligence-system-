import { Readable } from "node:stream";
import { Router } from "express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { requireRole } from "./auth";

const router = Router();
const storage = new ObjectStorageService();
const canUpload = requireRole("Admin", "Senior Surveyor", "Junior Surveyor");
const allowedTypes = new Map([
  [".pdf", "application/pdf"],
  [
    ".docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
]);
const maxUploadBytes = 25 * 1024 * 1024;

router.post(
  "/storage/uploads/request-url",
  canUpload,
  async (req, res): Promise<void> => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid upload details." });
      return;
    }

    const extension = parsed.data.name.toLocaleLowerCase().slice(
      parsed.data.name.lastIndexOf("."),
    );
    const expectedType = allowedTypes.get(extension);
    if (
      !expectedType ||
      parsed.data.contentType !== expectedType ||
      parsed.data.size > maxUploadBytes
    ) {
      res.status(400).json({
        error: "Choose a PDF or DOCX file up to 25 MB.",
      });
      return;
    }

    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    if (!objectPath.startsWith("/objects/uploads/")) {
      req.log.error("Object storage returned an unexpected private path");
      res.status(500).json({ error: "Unable to create a private upload." });
      return;
    }
    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
      }),
    );
  },
);

router.get("/storage/objects/*path", async (req, res): Promise<void> => {
  try {
    const rawPath = req.params.path;
    const wildcardPath = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
    const objectFile = await storage.getObjectEntityFile(
      `/objects/${wildcardPath}`,
    );
    const response = await storage.downloadObject(objectFile, 300);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Content-Disposition", "inline");
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Source document not found." });
      return;
    }
    req.log.error({ err: error }, "PIS source document could not be served");
    res.status(500).json({ error: "Unable to open the source document." });
  }
});

export default router;
