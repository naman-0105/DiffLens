import { execSync } from "child_process";

export function isGitRepo(cwd = process.cwd()) {
  try {
    const result = execSync("git rev-parse --is-inside-work-tree", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf-8"
    });
    return result.trim() === "true";
  } catch {
    return false;
  }
}

export function isValidGitRef(ref, cwd = process.cwd()) {
  try {
    execSync(`git rev-parse --verify "${ref}"`, {
      cwd,
      stdio: ["ignore", "ignore", "ignore"]
    });
    return true;
  } catch {
    return false;
  }
}

export function getChangedFiles(options = {}, cwd = process.cwd()) {
  try {
    let command;
    if (options.staged) {
      command = "git diff --staged --name-only";
    } else if (options.commit) {
      command = `git diff-tree --root --no-commit-id --name-only -r "${options.commit}"`;
    } else {
      command = "git diff --name-only";
    }

    const output = execSync(command, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"]
    });

    const files = output
      .split(/\r?\n/)
      .map((file) => file.trim())
      .filter((file) => file.length > 0);

    return [...new Set(files)];
  } catch {
    return [];
  }
}

export function getRawDiff(options = {}, cwd = process.cwd()) {
  let command;
  if (options.staged) {
    command = "git diff --staged";
  } else if (options.commit) {
    command = `git show -p --format="" "${options.commit}"`;
  } else {
    command = "git diff";
  }

  const output = execSync(command, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 10 * 1024 * 1024
  });

  return output.trim();
}

export function getGitChanges(options = {}, cwd = process.cwd()) {
  if (!isGitRepo(cwd)) {
    throw new Error("This directory is not a Git repository.");
  }

  if (options.commit && !isValidGitRef(options.commit, cwd)) {
    throw new Error(`Invalid Git reference: '${options.commit}'`);
  }

  const files = getChangedFiles(options, cwd);
  const diff = getRawDiff(options, cwd);

  return {
    files,
    diff,
    hasChanges: files.length > 0 && diff.length > 0
  };
}
