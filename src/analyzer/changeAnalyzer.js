function extractFunctionName(text) {
  if (!text) return null;

  const patterns = [
    /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/,
    /(?:export\s+)?class\s+([a-zA-Z0-9_$]+)/,
    /(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>/,
    /(?:async\s+)?([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1] || match[2] || match[3] || match[4];
      if (name && !["if", "for", "while", "switch", "catch"].includes(name)) {
        return name;
      }
    }
  }

  return null;
}

export function parseDiff(rawDiff) {
  if (!rawDiff || typeof rawDiff !== "string") {
    return {
      files: [],
      summary: { totalFiles: 0, totalAdded: 0, totalRemoved: 0 }
    };
  }

  const files = [];
  const fileChunks = rawDiff.split(/^diff --git /m).filter(Boolean);

  let totalAdded = 0;
  let totalRemoved = 0;

  for (const chunk of fileChunks) {
    const lines = chunk.split(/\r?\n/);
    const headerLine = lines[0] || "";

    const pathMatch = headerLine.match(/a\/(.*?)\s+b\/(.*)/);
    let filePath = pathMatch ? pathMatch[2] : "";

    let status = "modified";
    if (chunk.includes("new file mode")) {
      status = "added";
    } else if (chunk.includes("deleted file mode")) {
      status = "deleted";
    } else if (chunk.includes("similarity index") || chunk.includes("rename from")) {
      status = "renamed";
    }

    const hunks = chunk.split(/^@@ /m).slice(1);
    const changes = [];
    const changedFunctions = new Set();
    let fileAddedLines = 0;
    let fileRemovedLines = 0;

    for (const hunk of hunks) {
      const hunkLines = hunk.split(/\r?\n/);
      const hunkHeader = hunkLines[0] || "";

      const rangeMatch = hunkHeader.match(/-(\d+)(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s*@@(.*)/);
      if (!rangeMatch) continue;

      const newStartLine = parseInt(rangeMatch[2], 10);
      const lineCount = rangeMatch[3] !== undefined ? parseInt(rangeMatch[3], 10) : 1;
      const endLine = lineCount > 0 ? newStartLine + lineCount - 1 : newStartLine;
      const headerContext = rangeMatch[4] ? rangeMatch[4].trim() : "";

      let contextFunction = extractFunctionName(headerContext);

      const addedLines = [];
      const removedLines = [];

      for (let i = 1; i < hunkLines.length; i++) {
        const line = hunkLines[i];
        if (line.startsWith("+") && !line.startsWith("+++")) {
          const content = line.slice(1);
          addedLines.push(content);
          fileAddedLines++;

          if (!contextFunction) {
            contextFunction = extractFunctionName(content);
          }
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          const content = line.slice(1);
          removedLines.push(content);
          fileRemovedLines++;

          if (!contextFunction) {
            contextFunction = extractFunctionName(content);
          }
        }
      }

      if (contextFunction) {
        changedFunctions.add(contextFunction);
      }

      changes.push({
        startLine: newStartLine,
        endLine,
        addedLines,
        removedLines,
        addedCode: addedLines.join("\n"),
        removedCode: removedLines.join("\n"),
        contextFunction: contextFunction || null
      });
    }

    totalAdded += fileAddedLines;
    totalRemoved += fileRemovedLines;

    if (!filePath) {
      const bPathMatch = chunk.match(/\+\+\+\s+b\/(.*)/);
      if (bPathMatch) {
        filePath = bPathMatch[1];
      }
    }

    files.push({
      path: filePath,
      status,
      addedLinesCount: fileAddedLines,
      removedLinesCount: fileRemovedLines,
      changes,
      changedFunctions: Array.from(changedFunctions)
    });
  }

  return {
    files,
    summary: {
      totalFiles: files.length,
      totalAdded,
      totalRemoved
    }
  };
}

export function analyzeChanges(gitChanges) {
  const parsed = parseDiff(gitChanges.diff);
  return {
    ...parsed,
    rawDiff: gitChanges.diff
  };
}
