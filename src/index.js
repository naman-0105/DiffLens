#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import dotenv from "dotenv";
import { getGitChanges } from "./git/gitDiff.js";
import { analyzeChanges } from "./analyzer/changeAnalyzer.js";
import { runStaticAnalysis } from "./static/eslintAnalyzer.js";
import { analyzeFileDependencies, isSupportedSourceFile } from "./dependency/dependencyAnalyzer.js";

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

        console.log(chalk.bold("Code Dependency Analysis"));
        for (const file of analysis.files) {
          if (!isSupportedSourceFile(file.path)) continue;
          const deps = analyzeFileDependencies(file.path);
          if (!deps) continue;

          const localDeps = deps.imports.filter((i) => i.isLocal).map((i) => i.resolvedPath);
          if (localDeps.length > 0) {
            console.log(`${chalk.white(file.path)}`);
            for (const dep of localDeps) {
              console.log(`  ${chalk.gray("↳ depends on:")} ${chalk.cyan(dep)}`);
            }
          } else {
            console.log(`${chalk.white(file.path)} ${chalk.gray("(no local dependencies)")}`);
          }
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
