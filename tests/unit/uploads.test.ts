import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { precheckFile, sniffFileType, MB } from "@/lib/files";
import { processFileBytes, processSquareImage } from "@/server/dal/uploads";
import { docxLikeBytes, jpegWithExif, mp4Bytes, pdfBytes, pngBytes, pptxLikeBytes } from "./fixtures";

const ALL = ["image", "pdf", "docx", "pptx", "video"] as const;

describe("upload validation (before upload)", () => {
  it("accepts allowed types within size limits", () => {
    expect(precheckFile({ name: "notes.pdf", type: "application/pdf", size: 1 * MB })).toBeNull();
    expect(precheckFile({ name: "photo.JPG", type: "image/jpeg", size: 9 * MB })).toBeNull();
    expect(precheckFile({ name: "talk.mp4", type: "video/mp4", size: 49 * MB })).toBeNull();
  });
  it("rejects disallowed types, wrong extensions and oversize files", () => {
    expect(precheckFile({ name: "page.html", type: "text/html", size: 100 })).not.toBeNull();
    expect(precheckFile({ name: "icon.svg", type: "image/svg+xml", size: 100 })).not.toBeNull();
    expect(precheckFile({ name: "archive.zip", type: "application/zip", size: 100 })).not.toBeNull();
    expect(precheckFile({ name: "notes.exe", type: "application/pdf", size: 100 })).not.toBeNull();
    expect(precheckFile({ name: "photo.png", type: "image/png", size: 11 * MB })).not.toBeNull();
    expect(precheckFile({ name: "notes.pdf", type: "application/pdf", size: 26 * MB })).not.toBeNull();
    expect(precheckFile({ name: "talk.mp4", type: "video/mp4", size: 51 * MB })).not.toBeNull();
    expect(precheckFile({ name: "empty.pdf", type: "application/pdf", size: 0 })).not.toBeNull();
  });
  it("respects admin-disabled file kinds", () => {
    expect(precheckFile({ name: "talk.mp4", type: "video/mp4", size: 1 * MB }, ["image", "pdf"])).not.toBeNull();
  });
});

describe("content sniffing (magic bytes)", () => {
  it("detects real types", async () => {
    expect(sniffFileType(await pngBytes())?.mime).toBe("image/png");
    expect(sniffFileType(await jpegWithExif())?.mime).toBe("image/jpeg");
    expect(sniffFileType(pdfBytes())?.kind).toBe("pdf");
    expect(sniffFileType(docxLikeBytes())?.kind).toBe("docx");
    expect(sniffFileType(pptxLikeBytes())?.kind).toBe("pptx");
    expect(sniffFileType(mp4Bytes())?.kind).toBe("video");
  });
  it("rejects HTML, SVG, scripts and plain ZIPs", () => {
    expect(sniffFileType(Buffer.from("<!doctype html><script>alert(1)</script>"))).toBeNull();
    expect(sniffFileType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffFileType(Buffer.from("#!/bin/sh\nrm -rf /"))).toBeNull();
    expect(sniffFileType(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("hello.txt")]))).toBeNull();
  });
});

describe("finalise processing", () => {
  it("rejects a renamed HTML file pretending to be a PDF", async () => {
    await expect(processFileBytes(Buffer.from("<html>hi</html>"), "notes.pdf", [...ALL])).rejects.toThrow(/not an allowed/);
  });
  it("rejects a PDF named as an image", async () => {
    await expect(processFileBytes(pdfBytes(), "photo.png", [...ALL])).rejects.toThrow(/extension/);
  });
  it("re-encodes images and strips EXIF", async () => {
    const input = await jpegWithExif();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const out = await processFileBytes(input, "photo.jpg", [...ALL]);
    const meta = await sharp(out.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(out.data.includes(Buffer.from("SECRET-GPS-OWNER"))).toBe(false);
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it("crops avatars to a 512x512 WebP", async () => {
    const out = await processSquareImage(await pngBytes(800, 300));
    const meta = await sharp(out.data).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([512, 512, "webp"]);
  });
});
