#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { execSync } from "child_process";
import dotenv from "dotenv";

dotenv.config();

function isGitRepository() {
  try {
    const result = execSync("git rev-parse --is-inside-work-tree", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf-8"
    });
    return result.trim() === "true";
  } catch {
    return false;
  }
}

async function runCli() {
  const program = new Command();

  program
    .name("difflens")
    .description("AI-powered Git repository change analyzer")
    .version("1.0.0")
    .option("-s, --staged", "Analyze staged changes")
    .option("-c, --commit <ref>", "Analyze changes from a specific commit or reference")
    .action(async (options) => {
      if (!isGitRepository()) {
        console.error(chalk.red("Error: This directory is not a Git repository."));
        process.exit(1);
      }

      console.log(chalk.bold.cyan("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
      console.log(chalk.bold.cyan("       DiffLens"));
      console.log(chalk.bold.cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

      let modeDescription = "Analyzing unstaged working-tree changes...";
      if (options.staged) {
        modeDescription = "Analyzing staged changes...";
      } else if (options.commit) {
        modeDescription = `Analyzing commit: ${options.commit}...`;
      }

      console.log(chalk.gray(modeDescription));
    });

  await program.parseAsync(process.argv);
}

runCli();
