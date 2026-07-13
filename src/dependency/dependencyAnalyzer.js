import { parse } from "@babel/parser";
import fs from "fs";
import path from "path";

const SUPPORTED_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"]);

export function isSupportedSourceFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

export function resolveLocalImport(importSource, fromFilePath, cwd = process.cwd()) {
  if (!importSource.startsWith(".") && !importSource.startsWith("/")) {
    return null;
  }

  const fromDir = path.dirname(path.resolve(cwd, fromFilePath));
  const basePath = path.resolve(fromDir, importSource);
  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.ts`,
    `${basePath}.jsx`,
    `${basePath}.tsx`,
    `${basePath}.mjs`,
    `${basePath}.cjs`,
    path.join(basePath, "index.js"),
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.jsx"),
    path.join(basePath, "index.tsx")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        if (fs.statSync(candidate).isFile()) {
          return path.relative(cwd, candidate).replace(/\\/g, "/");
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

function traverseAst(node, visitors) {
  if (!node || typeof node !== "object") return;

  const visitor = visitors[node.type];
  if (visitor) {
    visitor(node);
  }

  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "loc" || key === "tokens") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object") {
          traverseAst(item, visitors);
        }
      }
    } else if (child && typeof child === "object") {
      traverseAst(child, visitors);
    }
  }
}

export function parseSourceFile(filePath, code, cwd = process.cwd()) {
  const imports = [];
  const exportsList = [];
  const definedFunctions = [];
  const functionCalls = [];

  let ast;
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: [
        "jsx",
        "typescript",
        "asyncGenerators",
        "classProperties",
        "classPrivateProperties",
        "classPrivateMethods",
        "dynamicImport",
        "exportDefaultFrom",
        "exportNamespaceFrom",
        "nullishCoalescingOperator",
        "optionalChaining",
        "objectRestSpread",
        "topLevelAwait"
      ],
      errorRecovery: true
    });
  } catch (err) {
    return {
      filePath,
      imports: [],
      exports: [],
      definedFunctions: [],
      functionCalls: [],
      error: err.message
    };
  }

  traverseAst(ast, {
    ImportDeclaration(node) {
      const source = node.source ? node.source.value : "";
      const resolvedPath = resolveLocalImport(source, filePath, cwd);
      const specifiers = (node.specifiers || []).map((s) => {
        if (s.type === "ImportDefaultSpecifier") {
          return { name: s.local.name, type: "default" };
        }
        if (s.type === "ImportNamespaceSpecifier") {
          return { name: s.local.name, type: "namespace" };
        }
        return {
          name: s.local.name,
          imported: s.imported ? (s.imported.name || s.imported.value) : s.local.name,
          type: "named"
        };
      });

      imports.push({
        source,
        resolvedPath,
        isLocal: Boolean(resolvedPath),
        specifiers
      });
    },

    CallExpression(node) {
      if (
        node.callee &&
        node.callee.type === "Identifier" &&
        node.callee.name === "require" &&
        node.arguments &&
        node.arguments.length > 0 &&
        node.arguments[0].type === "StringLiteral"
      ) {
        const source = node.arguments[0].value;
        const resolvedPath = resolveLocalImport(source, filePath, cwd);
        imports.push({
          source,
          resolvedPath,
          isLocal: Boolean(resolvedPath),
          specifiers: [{ name: "default", type: "commonjs" }]
        });
      }

      if (node.callee) {
        if (node.callee.type === "Identifier") {
          functionCalls.push(node.callee.name);
        } else if (node.callee.type === "MemberExpression" && node.callee.property) {
          const propName = node.callee.property.name || node.callee.property.value;
          if (propName) {
            functionCalls.push(propName);
          }
        }
      }
    },

    ExportNamedDeclaration(node) {
      if (node.declaration) {
        if (node.declaration.type === "FunctionDeclaration" && node.declaration.id) {
          exportsList.push(node.declaration.id.name);
        } else if (node.declaration.type === "ClassDeclaration" && node.declaration.id) {
          exportsList.push(node.declaration.id.name);
        } else if (node.declaration.type === "VariableDeclaration") {
          for (const decl of node.declaration.declarations) {
            if (decl.id && decl.id.name) {
              exportsList.push(decl.id.name);
            }
          }
        }
      }
      if (node.specifiers) {
        for (const s of node.specifiers) {
          if (s.exported) {
            exportsList.push(s.exported.name || s.exported.value);
          }
        }
      }
      if (node.source) {
        const source = node.source.value;
        const resolvedPath = resolveLocalImport(source, filePath, cwd);
        imports.push({
          source,
          resolvedPath,
          isLocal: Boolean(resolvedPath),
          specifiers: [{ name: "*", type: "re-export" }]
        });
      }
    },

    ExportDefaultDeclaration(node) {
      let name = "default";
      if (node.declaration) {
        if (node.declaration.id && node.declaration.id.name) {
          name = node.declaration.id.name;
        } else if (node.declaration.name) {
          name = node.declaration.name;
        }
      }
      exportsList.push(name);
    },

    FunctionDeclaration(node) {
      if (node.id && node.id.name) {
        definedFunctions.push({
          name: node.id.name,
          startLine: node.loc ? node.loc.start.line : 1,
          endLine: node.loc ? node.loc.end.line : 1
        });
      }
    },

    ClassDeclaration(node) {
      if (node.id && node.id.name) {
        definedFunctions.push({
          name: node.id.name,
          type: "class",
          startLine: node.loc ? node.loc.start.line : 1,
          endLine: node.loc ? node.loc.end.line : 1
        });
      }
    },

    VariableDeclarator(node) {
      if (
        node.id &&
        node.id.name &&
        node.init &&
        (node.init.type === "ArrowFunctionExpression" || node.init.type === "FunctionExpression")
      ) {
        definedFunctions.push({
          name: node.id.name,
          startLine: node.loc ? node.loc.start.line : 1,
          endLine: node.loc ? node.loc.end.line : 1
        });
      }
    }
  });

  return {
    filePath: filePath.replace(/\\/g, "/"),
    imports,
    exports: [...new Set(exportsList)],
    definedFunctions,
    functionCalls: [...new Set(functionCalls)],
    error: null
  };
}

export function analyzeFileDependencies(filePath, cwd = process.cwd()) {
  const fullPath = path.resolve(cwd, filePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const code = fs.readFileSync(fullPath, "utf-8");
  return parseSourceFile(filePath, code, cwd);
}
