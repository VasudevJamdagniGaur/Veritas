/**
 * Standalone ESM example. The Express API uses CommonJS: `src/lib/vertexVisual.js`
 * with env VERTEX_PROJECT, VERTEX_LOCATION, VERTEX_MODEL (see `src/lib/env.js`).
 */
import { VertexAI } from "@google-cloud/vertexai";

const vertexAI = new VertexAI({
  project: process.env.VERTEX_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "project-c212527d-22ac-4bbe-aaf",
  location: process.env.VERTEX_LOCATION || "us-central1",
});

const model = vertexAI.getGenerativeModel({
  model: process.env.VERTEX_MODEL || "gemini-1.5-flash",
});

export async function analyzeText(text) {
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text }] }],
  });

  return result.response.candidates[0].content.parts[0].text;
}