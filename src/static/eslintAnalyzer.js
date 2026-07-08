import { ESLint } from "eslint";
import globals from "globals";
import fs from "fs";
import path from "path";

const SUPPORTED_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"]);

export async function runStaticAnalysis(files, cwd = process.cwd()) {
  const codeFiles = files.filter((file) => {
    const ext = path.extname(file).toLowerCase();
    const fullPath = path.resolve(cwd, file);
    return SUPPORTED_EXTENSIONS.has(ext) && fs.existsSync(fullPath);
  });

  if (codeFiles.length === 0) {
    return {
      success: true,
      findings: [],
      errorCount: 0,
      warningCount: 0,
      error: null
    };
  }

  try {
    const eslint = new ESLint({
      cwd,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ["**/*.js", "**/*.mjs", "**/*.cjs", "**/*.jsx", "**/*.ts", "**/*.tsx"],
          languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
              ...globals.node,
              ...globals.browser
            },
            parserOptions: {
              ecmaFeatures: { jsx: true }
            }
          },
          rules: {
            "no-undef": "error",
            "no-unused-vars": "warn",
            "no-unreachable": "error",
            "no-constant-condition": "warn",
            "no-dupe-keys": "error",
            "no-duplicate-case": "error"
          }
        }
      ]
    });

    const results = await eslint.lintFiles(codeFiles);
    const findings = [];
    let errorCount = 0;
    let warningCount = 0;

    for (const result of results) {
      const relativeFile = path.relative(cwd, result.filePath).replace(/\\/g, "/");
      for (const msg of result.messages) {
        const severity = msg.severity === 2 ? "error" : "warning";
        if (severity === "error") errorCount++;
        if (severity === "warning") warningCount++;

        findings.push({
          file: relativeFile,
          line: msg.line || 1,
          column: msg.column || 1,
          severity,
          rule: msg.ruleId || "syntax-error",
          message: msg.message
        });
      }
    }

    return {
      success: true,
      findings,
      errorCount,
      warningCount,
      error: null
    };
  } catch (error) {
    return {
      success: false,
      findings: [],
      errorCount: 0,
      warningCount: 0,
      error: error.message
    };
  }
}
