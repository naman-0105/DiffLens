# DiffLens

DiffLens is a command-line tool that analyzes Git changes to help developers understand code impact, identify potential issues, and generate useful code-review suggestions.

Instead of sending an entire repository to an LLM, DiffLens combines Git diffs, ESLint static analysis, and AST-based dependency analysis for JavaScript and TypeScript to build a focused dependency context. It then uses the Gemini API to evaluate risk, identify logic and error-handling bugs, and produce suggested commit messages and pull request descriptions.

---

## Features

- **Git Diff Analysis**: Inspect unstaged changes, staged changes, or specific commits.
- **Static Code Analysis**: Runs ESLint on changed files to identify configured linting violations, unused variables, and potential code quality issues.
- **AST Dependency Parsing**: Parse JavaScript and TypeScript files using Babel to extract imports, exports, function declarations, and function calls.
- **Repository Dependency Graph**: Build an in-memory graph to identify direct dependencies and downstream dependents.
- **Focused Context Extraction**: Extract modified functions, surrounding code hunks, and directly related caller snippets instead of entire files.
- **Gemini-Powered Risk Analysis**: Evaluate change risk (LOW, MEDIUM, HIGH, CRITICAL) and provide actionable fixes and best practices.
- **Commit & PR Generation**: Automatically draft conventional commit messages and structured pull request summaries.

---

## Tech Stack

- **Runtime**: Node.js (ES Modules)
- **CLI Framework**: Commander.js
- **Git Integration**: Node.js child processes (`execSync`)
- **AST Parsing**: Babel Parser (`@babel/parser`)
- **Static Analysis**: ESLint programmatic API with `@typescript-eslint/parser` and `globals`
- **AI Review**: Google Gemini API (`@google/genai`)
- **Terminal Formatting**: Chalk

---

## How It Works

DiffLens runs a deterministic analysis pipeline before consulting an LLM:

1. **Read Git Changes**: Retrieves the raw diff and modified file list from Git.
2. **Run Static Analysis**: Lints changed files using ESLint to spot immediate code errors and warnings.
3. **Parse AST & Dependencies**: Uses Babel Parser to discover functions, imports, and exports across repository files.
4. **Build Focused Context**: Constructs an in-memory graph to map dependencies. It bundles modified function blocks, relevant caller snippets, and ESLint findings into a compact context payload.
5. **Analyze with Gemini**: Sends the targeted context to the Gemini API to assess risk, detail issues, suggest fixes, and draft commit/PR text.
6. **Display Terminal Report**: Prints clear, categorized results directly in your terminal.

---

## Getting Started

### Prerequisites

- Node.js
- Git
- A Google Gemini API key (required for AI-powered review)

---

### Installation

Clone and install DiffLens:

```bash
git clone https://github.com/naman-0105/DiffLens.git
cd DiffLens
npm install
```

Configure your Gemini API key in a `.env` file in the DiffLens installation directory:

```env
GEMINI_API_KEY=your_api_key_here
```

### Run DiffLens Locally

To test DiffLens from its own project directory:

```bash
node src/index.js
```

### Use DiffLens Across Repositories

Link the CLI globally on your local machine:

```bash
npm link
```

After linking, navigate to any Git repository you want to analyze and run:

```bash
cd path/to/your-project
difflens
```

DiffLens analyzes the Git changes in your current repository.

---

## Usage

Run these commands from the root of your target Git repository.

### Analyze Unstaged Changes

```bash
difflens
```

Analyzes changes in your working directory that haven't been staged.

### Analyze Staged Changes

```bash
difflens --staged
```

Analyzes changes added to the Git staging index.

### Analyze a Specific Commit or Git Reference

```bash
difflens --commit HEAD~1
```

You can also provide a commit hash, branch, or tag supported by your implementation.

### Without a Gemini API Key

DiffLens can still perform Git diff analysis, static checks, and dependency mapping. Configure `GEMINI_API_KEY` to enable AI-powered risk analysis and commit/PR generation.

---

## Environment Variables

DiffLens requires a single environment variable for the AI review step:

| Variable | Description | Required |
| --- | --- | --- |
| `GEMINI_API_KEY` | Google Gemini API key used for code review and PR generation | Yes (for AI analysis) |

---

## Terminal Output

DiffLens prints a structured report divided into distinct sections:

- **Changed Files**: Modified, added, or deleted files with change counts and affected functions.
- **Static Analysis**: ESLint warnings and errors with file names and line numbers.
- **Dependency & Impact Analysis**: Shows direct dependencies, downstream dependents, and potentially affected files.
- **Risk Level & Summary**: Overall risk classification (LOW, MEDIUM, HIGH, CRITICAL) and a short summary of changes.
- **Issues & Fixes**: Specific problems detected in code logic, error handling, or security, paired with concrete fixes and best-practice advice.
- **Suggested Commit**: A single-line conventional commit message
- **Pull Request**: A formatted pull request draft with title, summary, key changes, impact, and testing notes.
