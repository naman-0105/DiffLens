import fs from "fs";
import path from "path";
import { analyzeFileDependencies, isSupportedSourceFile } from "./dependencyAnalyzer.js";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".gemini",
  "coverage",
  ".next",
  ".cache"
]);

function scanDirectory(dir, cwd, files = []) {
  if (!fs.existsSync(dir)) return files;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(fullPath, cwd, files);
    } else if (entry.isFile() && isSupportedSourceFile(entry.name)) {
      const relativePath = path.relative(cwd, fullPath).replace(/\\/g, "/");
      files.push(relativePath);
    }
  }

  return files;
}

export class RepositoryGraph {
  constructor(cwd = process.cwd()) {
    this.cwd = cwd;
    this.dependencies = new Map();
    this.dependents = new Map();
    this.fileData = new Map();
  }

  build() {
    const allFiles = scanDirectory(this.cwd, this.cwd);

    for (const filePath of allFiles) {
      if (!this.dependencies.has(filePath)) {
        this.dependencies.set(filePath, new Set());
      }
      if (!this.dependents.has(filePath)) {
        this.dependents.set(filePath, new Set());
      }

      const parsed = analyzeFileDependencies(filePath, this.cwd);
      if (!parsed) continue;

      this.fileData.set(filePath, parsed);

      for (const imp of parsed.imports) {
        if (imp.isLocal && imp.resolvedPath) {
          this.dependencies.get(filePath).add(imp.resolvedPath);

          if (!this.dependents.has(imp.resolvedPath)) {
            this.dependents.set(imp.resolvedPath, new Set());
          }
          this.dependents.get(imp.resolvedPath).add(filePath);
        }
      }
    }

    return this;
  }

  getDirectDependencies(filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    const set = this.dependencies.get(normalized);
    return set ? Array.from(set) : [];
  }

  getDirectDependents(filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    const set = this.dependents.get(normalized);
    return set ? Array.from(set) : [];
  }

  traverse(startFiles, adjacencyMap, maxDepth = 2) {
    const visited = new Set();
    const queue = [];

    for (const file of startFiles) {
      const normalized = file.replace(/\\/g, "/");
      visited.add(normalized);
      queue.push({ file: normalized, depth: 0 });
    }

    const result = new Set();

    while (queue.length > 0) {
      const { file, depth } = queue.shift();
      if (depth >= maxDepth) continue;

      const neighbors = adjacencyMap.get(file);
      if (!neighbors) continue;

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          result.add(neighbor);
          queue.push({ file: neighbor, depth: depth + 1 });
        }
      }
    }

    return Array.from(result);
  }

  getDownstreamDependents(changedFiles, maxDepth = 2) {
    return this.traverse(changedFiles, this.dependents, maxDepth);
  }

  getUpstreamDependencies(changedFiles, maxDepth = 2) {
    return this.traverse(changedFiles, this.dependencies, maxDepth);
  }

  getImpactedContext(changedFiles, maxDepth = 2) {
    const normalizedChanged = changedFiles.map((f) => f.replace(/\\/g, "/"));
    const directDeps = new Set();
    const directDependents = new Set();

    for (const file of normalizedChanged) {
      for (const dep of this.getDirectDependencies(file)) {
        directDeps.add(dep);
      }
      for (const dependent of this.getDirectDependents(file)) {
        directDependents.add(dependent);
      }
    }

    const allDownstream = this.getDownstreamDependents(normalizedChanged, maxDepth);
    const allUpstream = this.getUpstreamDependencies(normalizedChanged, maxDepth);

    const relatedFiles = new Set([
      ...normalizedChanged,
      ...directDeps,
      ...directDependents,
      ...allDownstream,
      ...allUpstream
    ]);

    const graphSummary = {};
    for (const file of relatedFiles) {
      const deps = this.getDirectDependencies(file).filter((d) => relatedFiles.has(d));
      if (deps.length > 0) {
        graphSummary[file] = deps;
      }
    }

    return {
      changedFiles: normalizedChanged,
      directDependencies: Array.from(directDeps),
      directDependents: Array.from(directDependents),
      allDownstreamDependents: allDownstream,
      allUpstreamDependencies: allUpstream,
      relatedFiles: Array.from(relatedFiles),
      graphSummary
    };
  }

  getFileData(filePath) {
    const normalized = filePath.replace(/\\/g, "/");
    return this.fileData.get(normalized) || null;
  }
}

export function buildRepositoryGraph(cwd = process.cwd()) {
  const graph = new RepositoryGraph(cwd);
  return graph.build();
}
