#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import dotenv from "dotenv";
import { getGitChanges } from "./git/gitDiff.js";
import { analyzeChanges } from "./analyzer/changeAnalyzer.js";
import { runStaticAnalysis } from "./static/eslintAnalyzer.js";
import { buildRepositoryGraph } from "./dependency/repositoryGraph.js";

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
        console.log(chalk.bold.cyan("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
        console.log(chalk.bold.cyan("       DiffLens"));
        console.log(chalk.bold.cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

        const gitChanges = getGitChanges(options);

        if (!gitChanges.hasChanges) {
          console.log(chalk.yellow("No relevant changes found.\n"));
          return;
        }

        const analysis = analyzeChanges(gitChanges);

        console.log(chalk.bold("Changed Files"));
        for (const file of analysis.files) {
          const stats = chalk.green(`+${file.addedLinesCount}`) + " " + chalk.red(`-${file.removedLinesCount}`);
          const functions = file.changedFunctions.length > 0
            ? chalk.gray(` (functions: ${file.changedFunctions.join(", ")})`)
            : "";
          console.log(`${chalk.gray("•")} ${chalk.white(file.path)} [${chalk.blue(file.status)}] ${stats}${functions}`);
        }
        console.log();

        const changedFilePaths = analysis.files.map((file) => file.path);
        const staticResults = await runStaticAnalysis(changedFilePaths);

        console.log(chalk.bold("Static Analysis (ESLint)"));
        if (!staticResults.success) {
          console.log(chalk.yellow(`Static analysis could not be completed: ${staticResults.error}\n`));
        } else if (staticResults.findings.length === 0) {
          console.log(chalk.green("No static analysis issues detected.\n"));
        } else {
          for (const finding of staticResults.findings) {
            const tag = finding.severity === "error" ? chalk.red(`[${finding.severity.toUpperCase()}]`) : chalk.yellow(`[${finding.severity.toUpperCase()}]`);
            console.log(`${tag} ${chalk.gray(finding.rule)} ${chalk.white(`${finding.file}:${finding.line}:${finding.column}`)}`);
            console.log(`  ${chalk.gray("Message:")} ${finding.message}`);
          }
          console.log();
        }

        const repoGraph = buildRepositoryGraph();
        const impactContext = repoGraph.getImpactedContext(changedFilePaths);

        console.log(chalk.bold("Repository Graph & Impact Analysis"));
        if (impactContext.directDependencies.length > 0) {
          console.log(chalk.white("Direct Dependencies:"));
          for (const dep of impactContext.directDependencies) {
            console.log(`  ${chalk.gray("→")} ${chalk.cyan(dep)}`);
          }
        } else {
          console.log(chalk.gray("Direct Dependencies: (none)"));
        }

        if (impactContext.directDependents.length > 0) {
          console.log(chalk.white("Direct Dependents:"));
          for (const dep of impactContext.directDependents) {
            console.log(`  ${chalk.gray("←")} ${chalk.yellow(dep)}`);
          }
        } else {
          console.log(chalk.gray("Direct Dependents: (none)"));
        }
        console.log();
      } catch (error) {
        console.error(chalk.red(`Error: ${error.message}\n`));
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

runCli();
