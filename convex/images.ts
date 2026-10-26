"use node";

import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireUser, text } from "./core";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 18 * 1024 * 1024;
const PROVIDER_TIMEOUT_MS = 180_000;
const STYLE_INSTRUCTIONS = {
  natural: "Use a natural illustrated finish; for an edit, retain the artist's existing visual style.",
  watercolor: "Use translucent watercolor washes, soft pigment edges and subtle paper texture.",
  gouache: "Use opaque gouache shapes, a tactile painted surface and a restrained palette.",
  pencil: "Use expressive colored-pencil or graphite marks with visible drawing texture.",
  ink: "Use confident ink lines and a clear, readable hand-drawn composition.",
  pixel: "Use deliberate pixel-art clusters and a cohesive limited palette.",
  storybook: "Use a warm, imaginative storybook illustration style.",
} as const;

type Operation = "generate" | "edit";
type ImageResult = { jobId: Id<"imageJobs">; imageUrl: string; operation: Operation };
type Reservation = { jobId: Id<"imageJobs">; previewStorageId?: Id<"_storage">; sourceUrl: string | null };
type FailureCode = "provider_busy" | "provider_access" | "moderation_blocked" | "provider_error" | "timeout" | "invalid_output" | "source_unavailable" | "storage_error";

class ImageFailure extends Error {
  constructor(readonly code: FailureCode, message: string, readonly requestId?: string, readonly status?: number) {
    super(message);
    this.name = "ImageFailure";
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function safeRequestId(value: string | null): string | undefined {
  return value && /^req_[a-z\d_-]{1,120}$/i.test(value) ? value : undefined;
}

async function readBounded(response: Response, maximum: number): Promise<Uint8Array<ArrayBuffer>> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maximum) {
    await response.body?.cancel();
    throw new ImageFailure("invalid_output", "The image service returned a file that is too large.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ImageFailure("invalid_output", "The image service returned an empty response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new ImageFailure("invalid_output", "The image service returned a file that is too large.");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  return combined;
}

function validatePng(bytes: Uint8Array, exactSize = false): void {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.byteLength < 33 || bytes.byteLength > MAX_IMAGE_BYTES || !signature.every((value, index) => bytes[index] === value)
    || bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) {
    throw new ImageFailure("invalid_output", "The image could not be opened as a valid PNG. Your saved painting is unchanged.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (!width || !height || width > 4096 || height > 4096 || (exactSize && (width !== 1024 || height !== 1024))) {
    throw new ImageFailure("invalid_output", "The image service returned an unsupported canvas size. Your saved painting is unchanged.");
  }
}

function decodeOutput(value: unknown): Uint8Array<ArrayBuffer> {
  if (typeof value !== "string" || !value.length || value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4
    || value.length % 4 !== 0 || !/^[a-z\d+/]*={0,2}$/i.test(value)) {
    throw new ImageFailure("invalid_output", "The image service did not return a usable image. Your saved painting is unchanged.");
  }
  const bytes = new Uint8Array(Buffer.from(value, "base64"));
  validatePng(bytes, true);
  return bytes;
}

/** Store numerical billing evidence only: never provider prompts, error messages or credentials. */
function cleanUsage(value: unknown): Record<string, number | Record<string, number>> {
  const record = object(value);
  const result: Record<string, number | Record<string, number>> = {};
  if (!record) return result;
  for (const name of ["input_tokens", "output_tokens", "total_tokens"]) {
    const number = record[name];
    if (typeof number === "number" && Number.isFinite(number) && number >= 0) result[name] = number;
  }
  for (const name of ["input_tokens_details", "output_tokens_details"]) {
    const detail = object(record[name]);
    if (!detail) continue;
    const values: Record<string, number> = {};
    for (const key of ["image_tokens", "text_tokens", "cached_tokens"]) {
      const number = detail[key];
      if (typeof number === "number" && Number.isFinite(number) && number >= 0) values[key] = number;
    }
    if (Object.keys(values).length) result[name] = values;
  }
  return result;
}

async function readSource(url: string): Promise<Uint8Array<ArrayBuffer>> {
  if (!url.startsWith("https://")) throw new ImageFailure("source_unavailable", "Save your sketch again before asking for an edit.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "error" });
    if (!response.ok) throw new ImageFailure("source_unavailable", "Your saved sketch could not be opened. Save it again before asking for an edit.");
    const bytes = await readBounded(response, MAX_IMAGE_BYTES);
    validatePng(bytes);
    return bytes;
  } catch (error) {
    if (error instanceof ImageFailure) throw error;
    throw new ImageFailure("source_unavailable", "Your saved sketch could not be opened. Save it again before asking for an edit.");
  } finally {
    clearTimeout(timer);
  }
}

async function providerFailure(response: Response): Promise<ImageFailure> {
  const requestId = safeRequestId(response.headers.get("x-request-id"));
  let code: unknown;
  try {
    const body = JSON.parse(new TextDecoder().decode(await readBounded(response, 64 * 1024))) as unknown;
    code = object(object(body)?.error)?.code;
  } catch { /* An error body is optional. Never expose or persist it. */ }
  if (code === "moderation_blocked" || code === "content_policy_violation") {
    return new ImageFailure("moderation_blocked", "This image request could not be completed. Try a different prompt or reference image.", requestId, response.status);
  }
  if (response.status === 401 || response.status === 403) {
    return new ImageFailure("provider_access", "AI image access needs attention from the app owner. Your saved painting is unchanged.", requestId, response.status);
  }
  if (response.status === 429 || response.status >= 500) {
    return new ImageFailure("provider_busy", "The image service is busy or temporarily unavailable. Your saved painting is unchanged.", requestId, response.status);
  }
  return new ImageFailure("provider_error", "The image service could not complete this request. Try changing the prompt. Your saved painting is unchanged.", requestId, response.status);
}

export const request = action({
  args: {
    projectId: v.id("projects"),
    operation: v.union(v.literal("generate"), v.literal("edit")),
    prompt: v.string(),
    style: v.optional(v.string()),
  },
  returns: v.object({ jobId: v.id("imageJobs"), imageUrl: v.string(), operation: v.union(v.literal("generate"), v.literal("edit")) }),
  handler: async (ctx, args): Promise<ImageResult> => {
    const userId = await requireUser(ctx);
    const userPrompt = text(args.prompt, 1500, "Your image description", 1);
    const style = (args.style ?? "natural").trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(STYLE_INSTRUCTIONS, style)) {
      throw new ConvexError("Choose natural, watercolor, gouache, pencil, ink, pixel or storybook as the image style.");
    }
    const key = process.env.OPENAI_API_KEY;
    if (!key?.trim()) {
      // Misconfiguration must not consume a user's reserved attempt.
      throw new ConvexError("AI images are not configured yet. Your daily AI requests have not been used.");
    }
    const reservation: Reservation = await ctx.runMutation(internal.quota.reserve, {
      userId, projectId: args.projectId, operation: args.operation,
    });
    const { jobId } = reservation;
    const model = args.operation === "edit" ? "gpt-image-2.5-sunburst" : "gpt-image-2.5-flare";
    const styleInstruction = STYLE_INSTRUCTIONS[style as keyof typeof STYLE_INSTRUCTIONS];
    const prompt = args.operation === "edit"
      ? `Use the uploaded artist's canvas as the starting point. Preserve its composition, subject placement, recognizable details and personal character unless the artist explicitly requests a change. Make only the requested visual changes; keep the artist in control. Return one complete square image. ${styleInstruction}\nArtist's requested changes: ${userPrompt}`
      : `Create one original square illustration that the artist can continue painting by hand. Follow their description and leave the result free of captions or interface elements unless they specifically request text. ${styleInstruction}\nArtist's description: ${userPrompt}`;
    const safetyIdentifier = createHash("sha256").update(`canvas-club:${userId}`).digest("hex");
    let storageId: Id<"_storage"> | undefined;
    let registered = false;
    let requestId: string | undefined;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      let body: string | FormData;
      const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
      if (args.operation === "edit") {
        if (!reservation.sourceUrl) throw new ImageFailure("source_unavailable", "Save a sketch before asking for an AI edit.");
        const source = await readSource(reservation.sourceUrl);
        const form = new FormData();
        form.set("model", model);
        form.set("image", new Blob([source], { type: "image/png" }), "artist-canvas.png");
        form.set("prompt", prompt);
        form.set("size", "1024x1024");
        form.set("quality", "low");
        form.set("output_format", "png");
        form.set("n", "1");
        form.set("moderation", "auto");
        form.set("safety_identifier", safetyIdentifier);
        body = form;
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({ model, prompt, size: "1024x1024", quality: "low", output_format: "png", n: 1, moderation: "auto", safety_identifier: safetyIdentifier });
      }

      // Exactly one provider request. Retrying here could create a second billed image.
      timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
      const response = await fetch(`https://api.openai.com/v1/images/${args.operation === "edit" ? "edits" : "generations"}`, {
        method: "POST", headers, body, signal: controller.signal,
      });
      requestId = safeRequestId(response.headers.get("x-request-id"));
      if (!response.ok) throw await providerFailure(response);
      const payload = object(JSON.parse(new TextDecoder().decode(await readBounded(response, MAX_RESPONSE_BYTES))) as unknown);
      const items = payload?.data;
      if (!Array.isArray(items) || items.length !== 1) throw new ImageFailure("invalid_output", "The image service did not return a usable image. Your saved painting is unchanged.");
      const bytes = decodeOutput(object(items[0])?.b64_json);
      if (timer) { clearTimeout(timer); timer = undefined; }
      storageId = await ctx.storage.store(new Blob([bytes], { type: "image/png" }));
      const usageJson = JSON.stringify({ model, operation: args.operation, quality: "low", size: "1024x1024", ...(requestId ? { requestId } : {}), usage: cleanUsage(payload?.usage) });
      const result: { imageUrl: string | null } = await ctx.runMutation(internal.quota.finish, { jobId, storageId, success: true, usageJson });
      registered = true;
      if (!result.imageUrl) throw new ImageFailure("storage_error", "Your image was created, but its download link is unavailable. Please reopen your studio.");
      return { jobId, imageUrl: result.imageUrl, operation: args.operation };
    } catch (error) {
      const failure = error instanceof ImageFailure
        ? error
        : controller.signal.aborted
          ? new ImageFailure("timeout", "The image request took too long. Your saved painting is unchanged.", requestId)
          : new ImageFailure("provider_error", "Your image could not be completed. Your saved painting is unchanged.", requestId);
      if (storageId && !registered) {
        try { await ctx.storage.delete(storageId); } catch { /* Best effort; no raw provider or storage error logging. */ }
      }
      if (!registered) {
        try {
          await ctx.runMutation(internal.quota.finish, {
            jobId,
            success: false,
            error: failure.message,
            usageJson: JSON.stringify({ model, operation: args.operation, failureCode: failure.code, ...(failure.requestId ?? requestId ? { requestId: failure.requestId ?? requestId } : {}), ...(failure.status ? { status: failure.status } : {}) }),
          });
        } catch { /* Preserve the friendly failure even if recording its final state is unavailable. */ }
      }
      throw new ConvexError(`${failure.message} This attempt used one daily AI request.`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  },
});
