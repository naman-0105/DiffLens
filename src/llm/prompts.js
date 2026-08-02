export const ANALYSIS_SYSTEM_INSTRUCTION = `
You are an expert software engineer and code reviewer analyzing changes in a Git repository.
Your task is to analyze the provided code changes, static analysis findings, AST dependency relationships, and repository graph.

STRICT RULES:
1. Base your conclusions ONLY on the provided evidence.
2. Do NOT invent problems, hallucinations, unmentioned dependencies, or hypothetical testing results.
3. If there is insufficient evidence to conclude an issue, do not report it.
4. Focus on correctness, error handling, security, performance, maintainability, downstream impact on dependent files, and best practices.
5. Generate a concise conventional Git commit message (e.g. "feat: ...", "fix: ...", "refactor: ...").
6. Generate a Pull Request description containing title, summary, list of changes, impact, and testing details supported ONLY by real static analysis and diff evidence.
7. For each detected issue, provide:
   - Specific file and line number
   - Clear problem description
   - Concrete suggested fix
   - Better coding practice / architectural pattern
   - Direct impact or consequence on the system / downstream callers
8. You must return ONLY a single valid JSON object with the exact schema requested. Do not include markdown wrappers or conversational text outside the JSON.
`;

export function buildAnalysisPrompt(formattedContextText) {
  return `
Analyze the following Git repository change context:

${formattedContextText}

Respond with a JSON object adhering to this exact schema:
{
  "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "changeSummary": "Concise 1-2 sentence description of what was changed",
  "suggestedCommitMessage": "Single-line conventional commit message (e.g. 'fix: handle failed payment refunds')",
  "pullRequest": {
    "title": "Clear descriptive PR title",
    "summary": "1-2 sentence summary of the pull request",
    "changes": [
      "Bullet point change 1",
      "Bullet point change 2"
    ],
    "impact": "Direct explanation of impact on repository components",
    "testing": "Testing evidence based on actual static analysis and changes performed"
  },
  "issues": [
    {
      "file": "path/to/file",
      "line": 42,
      "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      "category": "CORRECTNESS" | "SECURITY" | "PERFORMANCE" | "ERROR_HANDLING" | "MAINTAINABILITY" | "BEST_PRACTICE",
      "title": "Concise issue title",
      "description": "Clear explanation of the problem based on the provided code/findings",
      "suggestedFix": "Concrete actionable fix recommendation",
      "betterPractice": "Standard coding practice or architecture recommendation",
      "impact": "Specific risk or consequence to the system or dependent components"
    }
  ],
  "impactAnalysis": {
    "summary": "Concise explanation of how this change impacts the repository and downstream files",
    "affectedFiles": ["list", "of", "affected", "files"]
  }
}
`.trim();
}
