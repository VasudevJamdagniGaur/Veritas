import { VertexAI } from "@google-cloud/vertexai";

const vertexAI = new VertexAI({
  project: "project-c212527d-22ac-4bbe-aaf",
  location: "us-central1",
});

const model = vertexAI.getGenerativeModel({
  model: "gemini-1.5-flash",
});

export async function analyzeText(text) {
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text }] }],
  });

  return result.response.candidates[0].content.parts[0].text;
}