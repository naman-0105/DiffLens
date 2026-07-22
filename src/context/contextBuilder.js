import fs from "fs";
import path from "path";

const MAX_SMALL_FILE_LINES = 40;

function readFileLines(filePath, cwd) {
  const fullPath = path.resolve(cwd, filePath);
  if (!fs.existsSync(fullPath)) return null;
  const content = fs.readFileSync(fullPath, "utf-8");
  return {
    content,
    lines: content.split(/\r?\n/)
  };
}

function extractFunctionSnippet(filePath, funcDef, cwd) {
  const fileData = readFileLines(filePath, cwd);
  if (!fileData) return null;

  const start = Math.max(1, funcDef.startLine);
  const end = Math.min(fileData.lines.length, funcDef.endLine);

  return {
    name: funcDef.name,
    startLine: start,
    endLine: end,
    code: fileData.lines.slice(start - 1, end).join("\n")
  };
}

function getRelevantRelatedSnippets(changedFiles, changedFuncNames, repoGraph, cwd) {
  const snippets = [];
  const processedKeys = new Set();

  for (const changedFile of changedFiles) {
    const directDeps = repoGraph.getDirectDependencies(changedFile);
    const directDependents = repoGraph.getDirectDependents(changedFile);

    const related = [
      ...directDeps.map((f) => ({ file: f, relationship: "dependency" })),
      ...directDependents.map((f) => ({ file: f, relationship: "dependent" }))
    ];

    for (const { file, relationship } of related) {
      const fileData = repoGraph.getFileData(file);
      if (!fileData) continue;

      const source = readFileLines(file, cwd);
      if (!source) continue;

      if (source.lines.length <= MAX_SMALL_FILE_LINES) {
        const key = `${file}:full`;
        if (!processedKeys.has(key)) {
          processedKeys.add(key);
          snippets.push({
            file,
            relationship,
            type: "full-file",
            code: source.content
          });
        }
        continue;
      }

      for (const funcDef of fileData.definedFunctions) {
        const isNameMatch = changedFuncNames.has(funcDef.name);
        const callsChangedFunc = fileData.functionCalls.some((call) => changedFuncNames.has(call));

        if (isNameMatch || callsChangedFunc) {
          const key = `${file}:${funcDef.name}`;
          if (!processedKeys.has(key)) {
            processedKeys.add(key);
            const snippet = extractFunctionSnippet(file, funcDef, cwd);
            if (snippet) {
              snippets.push({
                file,
                relationship,
                type: "function",
                functionName: funcDef.name,
                startLine: snippet.startLine,
                endLine: snippet.endLine,
                code: snippet.code
              });
            }
          }
        }
      }
    }
  }

  return snippets;
}

export function buildFocusedContext({
  analysis,
  staticResults,
  repoGraph,
  cwd = process.cwd()
}) {
  const changedFilePaths = analysis.files.map((f) => f.path);
  const impact = repoGraph.getImpactedContext(changedFilePaths);

  const allChangedFuncNames = new Set();
  for (const file of analysis.files) {
    for (const fn of file.changedFunctions) {
      allChangedFuncNames.add(fn);
    }
  }

  const changedSnippets = [];
  for (const file of analysis.files) {
    const source = readFileLines(file.path, cwd);
    if (!source) continue;

    if (source.lines.length <= MAX_SMALL_FILE_LINES) {
      changedSnippets.push({
        file: file.path,
        type: "full-file",
        code: source.content
      });
      continue;
    }

    const fileParsed = repoGraph.getFileData(file.path);
    if (fileParsed && fileParsed.definedFunctions.length > 0) {
      for (const change of file.changes) {
        const matchingFuncs = fileParsed.definedFunctions.filter(
          (fn) =>
            (change.startLine >= fn.startLine && change.startLine <= fn.endLine) ||
            (change.endLine >= fn.startLine && change.endLine <= fn.endLine) ||
            (change.contextFunction && fn.name === change.contextFunction)
        );

        for (const fn of matchingFuncs) {
          allChangedFuncNames.add(fn.name);
          const snippet = extractFunctionSnippet(file.path, fn, cwd);
          if (snippet) {
            changedSnippets.push({
              file: file.path,
              type: "changed-function",
              functionName: fn.name,
              startLine: snippet.startLine,
              endLine: snippet.endLine,
              code: snippet.code
            });
          }
        }
      }
    }

    if (changedSnippets.filter((s) => s.file === file.path).length === 0) {
      for (const change of file.changes) {
        if (change.addedCode) {
          changedSnippets.push({
            file: file.path,
            type: "diff-hunk",
            startLine: change.startLine,
            endLine: change.endLine,
            code: change.addedCode
          });
        }
      }
    }
  }

  const relatedSnippets = getRelevantRelatedSnippets(
    changedFilePaths,
    allChangedFuncNames,
    repoGraph,
    cwd
  );

  const relevantFindings = (staticResults.findings || []).filter((f) =>
    changedFilePaths.includes(f.file)
  );

  let rawContextSize = (analysis.rawDiff || "").length;
  for (const s of changedSnippets) rawContextSize += (s.code || "").length;
  for (const s of relatedSnippets) rawContextSize += (s.code || "").length;

  return {
    diff: analysis.rawDiff,
    changedFiles: analysis.files,
    changedSnippets,
    relatedSnippets,
    staticFindings: relevantFindings,
    graph: {
      directDependencies: impact.directDependencies,
      directDependents: impact.directDependents,
      graphSummary: impact.graphSummary
    },
    metrics: {
      changedFilesCount: changedFilePaths.length,
      changedSnippetsCount: changedSnippets.length,
      relatedSnippetsCount: relatedSnippets.length,
      approxContextCharacters: rawContextSize
    }
  };
}

export function formatContextForPrompt(context) {
  const sections = [];

  sections.push("=== 1. GIT DIFF ===");
  sections.push(context.diff || "(No diff available)");
  sections.push("");

  sections.push("=== 2. CHANGED CODE & SURROUNDING FUNCTIONS ===");
  if (context.changedSnippets.length === 0) {
    sections.push("(No additional function snippets required)");
  } else {
    for (const snippet of context.changedSnippets) {
      const header = snippet.functionName
        ? `[${snippet.file}] Function: ${snippet.functionName} (Lines ${snippet.startLine}-${snippet.endLine})`
        : `[${snippet.file}] (${snippet.type})`;
      sections.push(header);
      sections.push(snippet.code);
      sections.push("");
    }
  }

  sections.push("=== 3. RELEVANT DEPENDENCY & DEPENDENT CONTEXT ===");
  if (context.relatedSnippets.length === 0) {
    sections.push("(No external structural dependencies affected)");
  } else {
    for (const snippet of context.relatedSnippets) {
      const header = snippet.functionName
        ? `[${snippet.relationship.toUpperCase()}] ${snippet.file} -> Function: ${snippet.functionName} (Lines ${snippet.startLine}-${snippet.endLine})`
        : `[${snippet.relationship.toUpperCase()}] ${snippet.file} (${snippet.type})`;
      sections.push(header);
      sections.push(snippet.code);
      sections.push("");
    }
  }

  sections.push("=== 4. STATIC ANALYSIS FINDINGS (ESLint) ===");
  if (context.staticFindings.length === 0) {
    sections.push("No static analysis errors or warnings detected.");
  } else {
    for (const finding of context.staticFindings) {
      sections.push(
        `[${finding.severity.toUpperCase()}] ${finding.file}:${finding.line}:${finding.column} - ${finding.rule}: ${finding.message}`
      );
    }
  }
  sections.push("");

  sections.push("=== 5. REPOSITORY DEPENDENCY GRAPH ===");
  sections.push(`Direct Dependencies: ${context.graph.directDependencies.join(", ") || "(none)"}`);
  sections.push(`Direct Dependents: ${context.graph.directDependents.join(", ") || "(none)"}`);
  sections.push(`Graph Subgraph: ${JSON.stringify(context.graph.graphSummary, null, 2)}`);

  return sections.join("\n");
}
