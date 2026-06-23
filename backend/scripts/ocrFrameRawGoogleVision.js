import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vision from "@google-cloud/vision";

const imagePath = process.argv[2];

if (!imagePath) {
  console.error("Usage: node scripts/ocrFrameRawGoogleVision.js <image_path>");
  process.exit(1);
}

const client = new vision.ImageAnnotatorClient();

const buffer = await readFile(imagePath);

const [result] = await client.documentTextDetection({
  image: {
    content: buffer.toString("base64"),
  },
});

const rawText = result.fullTextAnnotation?.text || "";

console.log("Image:");
console.log(path.resolve(imagePath));
console.log("");
console.log("===== RAW OCR TEXT =====");
console.log(rawText || "(empty)");
