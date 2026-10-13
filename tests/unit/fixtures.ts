import sharp from "sharp";

export async function pngBytes(w = 20, h = 20): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 200, b: 200 } } }).png().toBuffer();
}

export async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: "SECRET-GPS-OWNER", Artist: "Someone" } } })
    .toBuffer();
}

export function pdfBytes(): Buffer {
  return Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "latin1");
}

export function docxLikeBytes(): Buffer {
  return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("....[Content_Types].xml....word/document.xml....", "latin1")]);
}

export function pptxLikeBytes(): Buffer {
  return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("....[Content_Types].xml....ppt/presentation.xml....", "latin1")]);
}

export function mp4Bytes(): Buffer {
  const b = Buffer.alloc(32);
  b.writeUInt32BE(32, 0);
  b.write("ftypisom", 4, "latin1");
  return b;
}
