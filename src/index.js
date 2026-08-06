#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import dotenv from "dotenv";
import { getGitChanges } from "./git/gitDiff.js";
import { analyzeChanges } from "./analyzer/changeAnalyzer.js";
import { runStaticAnalysis } from "./static/eslintAnalyzer.js";
import { buildRepositoryGraph } from "./dependency/repositoryGraph.js";
import { buildFocusedContext, formatContextForPrompt } from "./context/contextBuilder.js";
import { analyzeWithGemini } from "./llm/geminiClient.js";
import {
  formatHeader,
  formatChangedFiles,
  formatStaticFindings,
  formatGraphImpact,
  formatRiskLevel,
  formatIssues,
  formatImpactAnalysis,
  formatSuggestedCommit,
  formatPullRequest
} from "./output/formatter.js";

dotenv.config();

async function runCli() {
  const program = new Command();

  program
    .name("difflens")
    .description("AI-powered Git repository change analyzer")
    .version("1.0.0")
    .option("-s, --staged", "Analyze staged changes")
    .option("-c, --commit <ref>", "Analyze changes from a specific commit or reference")
    .action(async (options) => {
      try {
        console.log(formatHeader("DiffLens"));

        const gitChanges = getGitChanges(options);

        if (!gitChanges.hasChanges) {
          console.log(chalk.yellow("No relevant changes found.\n"));
          return;
        }

        const analysis = analyzeChanges(gitChanges);
        console.log(formatChangedFiles(analysis.files));

        const changedFilePaths = analysis.files.map((file) => file.path);
        const staticResults = await runStaticAnalysis(changedFilePaths);
        console.log(formatStaticFindings(staticResults));

        const repoGraph = buildRepositoryGraph();
        const impactContext = repoGraph.getImpactedContext(changedFilePaths);
        console.log(formatGraphImpact(impactContext));

        const context = buildFocusedContext({
          analysis,
          staticResults,
          repoGraph
        });

        const promptText = formatContextForPrompt(context);

        if (!process.env.GEMINI_API_KEY) {
          console.log(chalk.yellow("Note: GEMINI_API_KEY is not set. Add GEMINI_API_KEY in .env to enable Gemini LLM code analysis.\n"));
          return;
        }

        console.log(chalk.bold.magenta("Running Gemini LLM Analysis...\n"));
        const llmResult = await analyzeWithGemini(promptText);

        console.log(formatRiskLevel(llmResult.riskLevel));
        console.log(`${chalk.bold("Change Summary:")} ${chalk.white(llmResult.changeSummary)}\n`);

        if (llmResult.issues && llmResult.issues.length > 0) {
          console.log(formatIssues(llmResult.issues));
        }

        if (llmResult.impactAnalysis) {
          console.log(formatImpactAnalysis(llmResult.impactAnalysis));
        }

        if (llmResult.suggestedCommitMessage) {
          console.log(formatSuggestedCommit(llmResult.suggestedCommitMessage));
        }

        if (llmResult.pullRequest) {
          console.log(formatPullRequest(llmResult.pullRequest));
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}\n`));
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

runCli();
