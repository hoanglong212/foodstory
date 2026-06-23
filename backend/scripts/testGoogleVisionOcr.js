import "dotenv/config";
import path from "node:path";
import vision from "@google-cloud/vision";

async function main() {
  const imagePath = process.argv[2];

  if (!imagePath) {
    console.error("Usage: node scripts/testGoogleVisionOcr.js <image-path>");
    process.exit(1);
  }

  const client = new vision.ImageAnnotatorClient({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
  });

  const absolutePath = path.resolve(imagePath);

  console.log("Project:", process.env.GOOGLE_CLOUD_PROJECT);
  console.log("Image:", absolutePath);
  console.log("Using ADC local credentials.");

  const [result] = await client.documentTextDetection(absolutePath);

  const fullText = result.fullTextAnnotation?.text || "";

  console.log("\n--- GOOGLE VISION FULL TEXT ---");
  console.log(fullText || "[EMPTY]");
}

main().catch((err) => {
  console.error("\nGoogle Vision test failed:");
  console.error(err.message || err);
  process.exit(1);
});
