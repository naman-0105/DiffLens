import { GoogleGenAI } from "@google/genai";
import { ANALYSIS_SYSTEM_INSTRUCTION, buildAnalysisPrompt } from "./prompts.js";

const VALID_RISK_LEVELS = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

function sanitizeErrorMessage(message, apiKey) {
  if (!apiKey) return message;
  return message.split(apiKey).join("***");
}

function cleanJsonString(raw) {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }
  return cleaned;
}

export async function analyzeWithGemini(formattedContextText, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("GEMINI_API_KEY is missing. Please set GEMINI_API_KEY in your .env file.");
  }

  const prompt = buildAnalysisPrompt(formattedContextText);
  const modelName = options.model || "gemini-2.5-flash";

  let rawText = "";

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: ANALYSIS_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json"
      }
    });

    rawText = response.text || "";
  } catch (sdkError) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: ANALYSIS_SYSTEM_INSTRUCTION }]
          },
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${errorBody}`);
      }

      const data = await res.json();
      rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } catch (fetchError) {
      const msg = sdkError.message || fetchError.message || "Unknown error";
      throw new Error(`Failed to call Gemini API: ${sanitizeErrorMessage(msg, apiKey)}`);
    }
  }

  if (!rawText || rawText.trim() === "") {
    throw new Error("Received empty response from Gemini API.");
  }

  let parsed;
  try {
    parsed = JSON.parse(cleanJsonString(rawText));
  } catch (jsonErr) {
    throw new Error(`Invalid JSON response from LLM: ${jsonErr.message}`);
  }

  const riskLevel = VALID_RISK_LEVELS.has(parsed.riskLevel?.toUpperCase())
    ? parsed.riskLevel.toUpperCase()
    : "LOW";

  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.map((issue) => ({
        file: issue.file || "unknown",
        line: typeof issue.line === "number" ? issue.line : 1,
        severity: VALID_RISK_LEVELS.has(issue.severity?.toUpperCase())
          ? issue.severity.toUpperCase()
          : "LOW",
        category: issue.category || "MAINTAINABILITY",
        title: issue.title || "Code Issue",
        description: issue.description || "",
        suggestedFix: issue.suggestedFix || "",
        betterPractice: issue.betterPractice || "",
        impact: issue.impact || ""
      }))
    : [];

  const impactAnalysis = {
    summary: parsed.impactAnalysis?.summary || "No specific downstream impact identified.",
    affectedFiles: Array.isArray(parsed.impactAnalysis?.affectedFiles)
      ? parsed.impactAnalysis.affectedFiles
      : []
  };

  const changeSummary = parsed.changeSummary || "Repository changes analyzed.";
  const suggestedCommitMessage = typeof parsed.suggestedCommitMessage === "string" && parsed.suggestedCommitMessage.trim().length > 0
    ? parsed.suggestedCommitMessage.trim()
    : "chore: update repository files";

  const pullRequest = {
    title: typeof parsed.pullRequest?.title === "string" && parsed.pullRequest.title.trim().length > 0
      ? parsed.pullRequest.title.trim()
      : changeSummary,
    summary: typeof parsed.pullRequest?.summary === "string" && parsed.pullRequest.summary.trim().length > 0
      ? parsed.pullRequest.summary.trim()
      : changeSummary,
    changes: Array.isArray(parsed.pullRequest?.changes) && parsed.pullRequest.changes.length > 0
      ? parsed.pullRequest.changes
      : [changeSummary],
    impact: typeof parsed.pullRequest?.impact === "string" && parsed.pullRequest.impact.trim().length > 0
      ? parsed.pullRequest.impact.trim()
      : impactAnalysis.summary,
    testing: typeof parsed.pullRequest?.testing === "string" && parsed.pullRequest.testing.trim().length > 0
      ? parsed.pullRequest.testing.trim()
      : "Static analysis and repository structure verification completed."
  };

  return {
    riskLevel,
    issues,
    impactAnalysis,
    changeSummary,
    suggestedCommitMessage,
    pullRequest,
    rawResponse: parsed
  };
}
