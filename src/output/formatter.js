import chalk from "chalk";

const DIVIDER_LINE = "────────────────────────────────────";
const HEADER_LINE = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

export function formatHeader(appName = "DiffLens") {
  return [
    chalk.bold.cyan(`\n${HEADER_LINE}`),
    chalk.bold.cyan(`       ${appName}`),
    chalk.bold.cyan(`${HEADER_LINE}\n`)
  ].join("\n");
}

export function formatChangedFiles(files) {
  const lines = [chalk.bold("Changed Files")];
  for (const file of files) {
    const stats = chalk.green(`+${file.addedLinesCount}`) + " " + chalk.red(`-${file.removedLinesCount}`);
    const functions = file.changedFunctions.length > 0
      ? chalk.gray(` (functions: ${file.changedFunctions.join(", ")})`)
      : "";
    lines.push(`${chalk.gray("•")} ${chalk.white(file.path)} [${chalk.blue(file.status)}] ${stats}${functions}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function formatStaticFindings(staticResults) {
  const lines = [chalk.bold("Static Analysis (ESLint)")];
  if (!staticResults.success) {
    lines.push(chalk.yellow(`Static analysis could not be completed: ${staticResults.error}\n`));
  } else if (staticResults.findings.length === 0) {
    lines.push(chalk.green("No static analysis issues detected.\n"));
  } else {
    for (const finding of staticResults.findings) {
      const tag = finding.severity === "error"
        ? chalk.red(`[${finding.severity.toUpperCase()}]`)
        : chalk.yellow(`[${finding.severity.toUpperCase()}]`);
      lines.push(`${tag} ${chalk.gray(finding.rule)} ${chalk.white(`${finding.file}:${finding.line}:${finding.column}`)}`);
      lines.push(`  ${chalk.gray("Message:")} ${finding.message}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function formatGraphImpact(impactContext) {
  const lines = [chalk.bold("Repository Graph & Impact Analysis")];
  if (impactContext.directDependencies.length > 0) {
    lines.push(chalk.white("Direct Dependencies:"));
    for (const dep of impactContext.directDependencies) {
      lines.push(`  ${chalk.gray("→")} ${chalk.cyan(dep)}`);
    }
  } else {
    lines.push(chalk.gray("Direct Dependencies: (none)"));
  }

  if (impactContext.directDependents.length > 0) {
    lines.push(chalk.white("Direct Dependents:"));
    for (const dep of impactContext.directDependents) {
      lines.push(`  ${chalk.gray("←")} ${chalk.yellow(dep)}`);
    }
  } else {
    lines.push(chalk.gray("Direct Dependents: (none)"));
  }
  lines.push("");
  return lines.join("\n");
}

export function formatRiskLevel(riskLevel) {
  const riskColor = riskLevel === "CRITICAL" || riskLevel === "HIGH"
    ? chalk.red.bold
    : riskLevel === "MEDIUM"
    ? chalk.yellow.bold
    : chalk.green.bold;

  return `${chalk.bold("Risk Level:")} ${riskColor(riskLevel)}\n`;
}

export function formatIssues(issues) {
  if (!issues || issues.length === 0) return "";

  const lines = [
    chalk.bold("Issues"),
    chalk.gray(DIVIDER_LINE)
  ];

  for (const issue of issues) {
    const sevTag = issue.severity === "CRITICAL" || issue.severity === "HIGH"
      ? chalk.red.bold(`[${issue.severity}]`)
      : issue.severity === "MEDIUM"
      ? chalk.yellow.bold(`[${issue.severity}]`)
      : chalk.green.bold(`[${issue.severity}]`);

    lines.push("");
    lines.push(`${sevTag} ${chalk.cyan(issue.category)}`);
    lines.push(chalk.white(`${issue.file}:${issue.line}`));
    lines.push(`\n${chalk.bold("Problem:")}\n${issue.description || issue.title}`);

    if (issue.suggestedFix) {
      lines.push(`\n${chalk.bold("Suggested Fix:")}\n${issue.suggestedFix}`);
    }
    if (issue.betterPractice) {
      lines.push(`\n${chalk.bold("Better Practice:")}\n${issue.betterPractice}`);
    }
    if (issue.impact) {
      lines.push(`\n${chalk.bold("Impact:")}\n${issue.impact}`);
    }
    lines.push(chalk.gray(DIVIDER_LINE));
  }
  lines.push("");
  return lines.join("\n");
}

export function formatImpactAnalysis(impactAnalysis) {
  const lines = [
    chalk.bold("Impact"),
    chalk.gray(DIVIDER_LINE),
    impactAnalysis.summary || "No specific downstream impact noted."
  ];

  if (impactAnalysis.affectedFiles && impactAnalysis.affectedFiles.length > 0) {
    lines.push(chalk.bold("\nAffected Files:"));
    for (const aff of impactAnalysis.affectedFiles) {
      lines.push(`${chalk.gray("•")} ${chalk.white(aff)}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function formatSuggestedCommit(commitMessage) {
  return [
    chalk.bold("Suggested Commit"),
    chalk.gray(DIVIDER_LINE),
    chalk.green(commitMessage),
    ""
  ].join("\n");
}

export function formatPullRequest(pullRequest) {
  if (!pullRequest) return "";

  const lines = [
    chalk.bold("Pull Request"),
    chalk.gray(DIVIDER_LINE),
    `${chalk.bold("Title:")} ${pullRequest.title}\n`,
    `${chalk.bold("Summary:")}\n${pullRequest.summary}\n`,
    chalk.bold("Changes:")
  ];

  for (const chg of pullRequest.changes || []) {
    lines.push(`${chalk.gray("•")} ${chg}`);
  }

  lines.push(`\n${chalk.bold("Impact:")}\n${pullRequest.impact}\n`);
  lines.push(`${chalk.bold("Testing:")}\n${pullRequest.testing}\n`);

  return lines.join("\n");
}

export function formatFullReport({
  analysis,
  staticResults,
  impactContext,
  llmResult
}) {
  const output = [];

  output.push(formatChangedFiles(analysis.files));

  if (staticResults) {
    output.push(formatStaticFindings(staticResults));
  }

  if (impactContext) {
    output.push(formatGraphImpact(impactContext));
  }

  if (llmResult) {
    output.push(formatRiskLevel(llmResult.riskLevel));

    if (llmResult.changeSummary) {
      output.push(`${chalk.bold("Change Summary:")} ${chalk.white(llmResult.changeSummary)}\n`);
    }

    if (llmResult.issues && llmResult.issues.length > 0) {
      output.push(formatIssues(llmResult.issues));
    }

    if (llmResult.impactAnalysis) {
      output.push(formatImpactAnalysis(llmResult.impactAnalysis));
    }

    if (llmResult.suggestedCommitMessage) {
      output.push(formatSuggestedCommit(llmResult.suggestedCommitMessage));
    }

    if (llmResult.pullRequest) {
      output.push(formatPullRequest(llmResult.pullRequest));
    }
  }

  return output.join("\n");
}
