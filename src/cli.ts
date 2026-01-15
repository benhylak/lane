#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { render } from "ink";
import React from "react";
import {
  createLane,
  removeLaneCmd,
  getLaneForSwitch,
  listAllLanes,
  getMainRepoRoot,
} from "./lanes.js";
import { LaneList } from "./ui/LaneList.js";

const program = new Command();

// Magic prefix for shell function to detect cd commands
const CD_PREFIX = "__lane_cd:";

program
  .name("lane")
  .description("A simple alternative to git worktrees")
  .version("0.1.0");

// lane new <name>
program
  .command("new <name>")
  .description("Create a new lane")
  .option("-b, --branch <branch>", "Use a specific branch name (defaults to lane name)")
  .option("--no-install", "Skip automatic dependency installation")
  .action(async (name: string, options: { branch?: string; install: boolean }) => {
    console.log(chalk.blue(`Creating lane "${name}"...`));

    const result = await createLane(name, {
      branch: options.branch,
      skipInstall: !options.install,
    });

    if (!result.success) {
      console.error(chalk.red(`Error: ${result.error}`));
      process.exit(1);
    }

    console.log(chalk.green(`\nLane "${name}" created successfully!`));
    console.log(chalk.dim(`  Path: ${result.lane?.path}`));
    console.log(chalk.dim(`  Branch: ${result.lane?.branch}`));

    // Output the cd command for shell function
    console.log(`${CD_PREFIX}${result.lane?.path}`);
  });

// lane switch <name>
program
  .command("switch <name>")
  .description("Switch to a lane")
  .action((name: string) => {
    const lane = getLaneForSwitch(name);

    if (!lane) {
      console.error(chalk.red(`Error: Lane "${name}" not found`));
      process.exit(1);
    }

    // Output the cd command for shell function
    console.log(`${CD_PREFIX}${lane.path}`);
  });

// lane list
program
  .command("list")
  .alias("ls")
  .description("List all lanes")
  .option("-i, --interactive", "Show interactive UI")
  .action((options: { interactive?: boolean }) => {
    const lanes = listAllLanes();

    if (lanes.length === 0) {
      console.log(chalk.yellow("No lanes found. Create one with: lane new <name>"));
      return;
    }

    if (options.interactive) {
      const { waitUntilExit } = render(
        React.createElement(LaneList, {
          lanes,
          onSelect: (lane) => {
            console.log(`${CD_PREFIX}${lane.path}`);
          },
        })
      );
      waitUntilExit();
    } else {
      console.log(chalk.bold("\nLanes:\n"));
      for (const lane of lanes) {
        const current = lane.isCurrent ? chalk.green(" ← current") : "";
        const main = lane.isMain ? chalk.dim(" (main)") : "";
        console.log(
          `  ${chalk.cyan(lane.name)}${main}${current}`
        );
        console.log(chalk.dim(`    Branch: ${lane.branch}`));
        console.log(chalk.dim(`    Path: ${lane.path}`));
        console.log();
      }
    }
  });

// lane remove <name>
program
  .command("remove <name>")
  .alias("rm")
  .description("Remove a lane")
  .option("-d, --delete-branch", "Also delete the associated branch")
  .option("-f, --force", "Force removal even if there are uncommitted changes")
  .action(async (name: string, options: { deleteBranch?: boolean; force?: boolean }) => {
    if (name === "main" || name === "origin") {
      console.error(chalk.red("Error: Cannot remove the main repository"));
      process.exit(1);
    }

    console.log(chalk.blue(`Removing lane "${name}"...`));

    const result = await removeLaneCmd(name, {
      deleteBranch: options.deleteBranch,
      force: options.force,
    });

    if (!result.success) {
      console.error(chalk.red(`Error: ${result.error}`));
      process.exit(1);
    }

    console.log(chalk.green(`Lane "${name}" removed successfully!`));
  });

// lane init-shell
program
  .command("init-shell")
  .description("Output shell function for automatic cd")
  .option("--bash", "Output bash function")
  .option("--zsh", "Output zsh function")
  .option("--fish", "Output fish function")
  .action((options: { bash?: boolean; zsh?: boolean; fish?: boolean }) => {
    // Detect shell if not specified
    const shell = process.env.SHELL || "";
    const isFish = options.fish || shell.includes("fish");
    const isBash = options.bash || shell.includes("bash");
    // Default to zsh-compatible (works for zsh and bash)

    if (isFish) {
      console.log(`# Add this to ~/.config/fish/config.fish
function lane
    set -l result (command lane $argv)
    set -l code $status

    if string match -q "__lane_cd:*" "$result"
        cd (string replace "__lane_cd:" "" "$result")
    else
        test -n "$result"; and echo "$result"
    end

    return $code
end`);
    } else {
      // Bash/Zsh compatible
      console.log(`# Add this to ~/.zshrc or ~/.bashrc
lane() {
  local result
  result=$(command lane "$@")
  local code=$?

  if [[ "$result" == *$'\\n__lane_cd:'* ]]; then
    # Output has multiple lines, print all but last, then cd
    echo "\${result%$'\\n'__lane_cd:*}"
    cd "\${result##*__lane_cd:}"
  elif [[ "$result" == __lane_cd:* ]]; then
    cd "\${result#__lane_cd:}"
  else
    [[ -n "$result" ]] && echo "$result"
  fi

  return $code
}`);
    }

    console.log(chalk.dim("\n# Then restart your shell or run: source ~/.zshrc"));
  });

// lane status
program
  .command("status")
  .description("Show current lane status")
  .action(() => {
    const mainRoot = getMainRepoRoot();
    if (!mainRoot) {
      console.error(chalk.red("Not in a git repository"));
      process.exit(1);
    }

    const lanes = listAllLanes();
    const current = lanes.find((l) => l.isCurrent);

    if (current) {
      console.log(chalk.bold("Current lane:"), chalk.cyan(current.name));
      console.log(chalk.dim(`  Branch: ${current.branch}`));
      console.log(chalk.dim(`  Path: ${current.path}`));
    } else {
      console.log(chalk.yellow("Not in a known lane"));
    }
  });

program.parse();
