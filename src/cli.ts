import { Command } from "commander";
import chalk from "chalk";
import { render } from "ink";
import React from "react";

// Render Ink to stderr so it shows while shell wrapper captures stdout
const renderUI = (element: React.ReactElement) => {
  return render(element, {
    stdout: process.stderr,
    stdin: process.stdin,
  });
};
import {
  createLane,
  removeLaneCmd,
  getLaneForSwitch,
  listAllLanes,
  getMainRepoRoot,
  syncLane,
  smartLane,
  findLaneByBranch,
} from "./lanes.js";
import { recordLaneSwitch, getPreviousLane, loadConfig, saveConfig, CopyMode } from "./config.js";
import { LaneList } from "./ui/LaneList.js";
import { LaneManager } from "./ui/LaneManager.js";
import { Settings } from "./ui/Settings.js";
import { CheckoutSelector } from "./ui/CheckoutSelector.js";
import { branchExists } from "./git.js";
import { execSync } from "child_process";

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
  .description("Create a new lane (full copy)")
  .option("-b, --branch <branch>", "Use a specific branch name (defaults to lane name)")
  .action(async (name: string, options: { branch?: string }) => {
    console.log(chalk.blue(`Creating lane "${name}"...`));

    const result = await createLane(name, {
      branch: options.branch,
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
      const { waitUntilExit } = renderUI(
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
  .description("Set up shell integration for automatic cd")
  .option("--print", "Print the shell function instead of installing")
  .action(async (options: { print?: boolean }) => {
    const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import("fs");
    const { homedir } = await import("os");
    const pathModule = await import("path");

    const shell = process.env.SHELL || "";
    const isFish = shell.includes("fish");
    const home = homedir();

    const MARKER = "# >>> lane shell integration >>>";
    const MARKER_END = "# <<< lane shell integration <<<";

    const fishFunction = `${MARKER}
function lane
    set -l result (command lane $argv)
    set -l code $status

    if string match -q "*__lane_cd:*" "$result"
        set -l lines (string split \\n "$result")
        for line in $lines
            if string match -q "__lane_cd:*" "$line"
                cd (string replace "__lane_cd:" "" "$line")
            else
                test -n "$line"; and echo "$line"
            end
        end
    else
        test -n "$result"; and echo "$result"
    end
    return $code
end
${MARKER_END}`;

    const bashZshFunction = `${MARKER}
lane() {
  local result
  result=$(command lane "$@")
  local code=$?
  if [[ "$result" == *__lane_cd:* ]]; then
    local output=""
    local cdpath=""
    while IFS= read -r line; do
      if [[ "$line" == __lane_cd:* ]]; then
        cdpath="\${line#__lane_cd:}"
      else
        [[ -n "$output" ]] && output="$output"$'\\n'
        output="$output$line"
      fi
    done <<< "$result"
    [[ -n "$output" ]] && echo "$output"
    [[ -n "$cdpath" ]] && cd "$cdpath"
  else
    [[ -n "$result" ]] && echo "$result"
  fi
  return $code
}
${MARKER_END}`;

    const shellFunc = isFish ? fishFunction : bashZshFunction;

    // Just print if requested
    if (options.print) {
      console.log(shellFunc);
      return;
    }

    // Determine config file
    let configFile: string;
    if (isFish) {
      configFile = pathModule.join(home, ".config", "fish", "config.fish");
      // Ensure fish config dir exists
      const fishConfigDir = pathModule.dirname(configFile);
      if (!existsSync(fishConfigDir)) {
        mkdirSync(fishConfigDir, { recursive: true });
      }
    } else if (shell.includes("zsh")) {
      configFile = pathModule.join(home, ".zshrc");
    } else {
      configFile = pathModule.join(home, ".bashrc");
    }

    // Check if already installed
    let existingContent = "";
    if (existsSync(configFile)) {
      existingContent = readFileSync(configFile, "utf-8");
      if (existingContent.includes(MARKER)) {
        // Remove old version
        const regex = new RegExp(
          `${MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${MARKER_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`,
          "g"
        );
        existingContent = existingContent.replace(regex, "");
      }
    }

    // Append new function
    const newContent = existingContent.trimEnd() + "\n\n" + shellFunc + "\n";
    writeFileSync(configFile, newContent);

    console.log(chalk.green(`✓ Shell integration installed to ${configFile}`));
    console.log();
    console.log("Run this to activate (or restart your terminal):");
    console.log(chalk.cyan(`  source ${configFile}`));
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

// lane sync [name]
program
  .command("sync [name]")
  .description("Sync untracked files from main repo to a lane")
  .action(async (name?: string) => {
    console.log(chalk.blue(name ? `Syncing lane "${name}"...` : "Syncing current lane..."));

    const result = await syncLane(name);

    if (!result.success) {
      console.error(chalk.red(`Error: ${result.error}`));
      process.exit(1);
    }

    if (result.copiedFiles.length === 0) {
      console.log(chalk.yellow("No untracked files to sync."));
    } else {
      console.log(chalk.green(`Synced ${result.copiedFiles.length} file(s):`));
      for (const file of result.copiedFiles.slice(0, 10)) {
        console.log(chalk.dim(`  ${file}`));
      }
      if (result.copiedFiles.length > 10) {
        console.log(chalk.dim(`  ... and ${result.copiedFiles.length - 10} more`));
      }
    }
  });

// lane rename <new-name> - rename current lane
program
  .command("rename <new-name>")
  .description("Rename the current lane")
  .action(async (newName: string) => {
    const lanes = listAllLanes();
    const current = lanes.find((l) => l.isCurrent);

    if (!current) {
      console.error(chalk.red("Not in a lane"));
      process.exit(1);
    }

    if (current.isMain) {
      console.error(chalk.red("Cannot rename the main repo"));
      process.exit(1);
    }

    if (current.name === newName) {
      console.error(chalk.yellow("Already named that"));
      process.exit(1);
    }

    // Check if new name already exists
    if (lanes.find((l) => l.name === newName)) {
      console.error(chalk.red(`Lane "${newName}" already exists`));
      process.exit(1);
    }

    const mainRoot = getMainRepoRoot();
    if (!mainRoot) {
      console.error(chalk.red("Not in a git repository"));
      process.exit(1);
    }

    const { renameLane } = await import("./lanes.js");
    const result = await renameLane(current.name, newName);

    if (!result.success) {
      console.error(chalk.red(`Error: ${result.error}`));
      process.exit(1);
    }

    console.log(chalk.green(`Renamed "${current.name}" → "${newName}"`));
    // cd to new path
    console.log(`${CD_PREFIX}${result.newPath}`);
  });

// lane checkout <branch> - switch to lane with branch or choose action
program
  .command("checkout <branch>")
  .alias("co")
  .description("Switch to lane with branch, or choose where to checkout")
  .action(async (branchName: string) => {
    const mainRoot = getMainRepoRoot();
    const currentPath = process.cwd();

    if (!mainRoot) {
      console.error(chalk.red("Not in a git repository"));
      process.exit(1);
    }

    // Check if any lane has this branch currently checked out
    const laneWithBranch = findLaneByBranch(branchName);

    if (laneWithBranch) {
      // Found a lane with this branch - switch to it
      console.log(chalk.green(`Switching to lane "${laneWithBranch.name}" (branch: ${branchName})`));
      recordLaneSwitch(mainRoot, currentPath);
      console.log(`${CD_PREFIX}${laneWithBranch.path}`);
      return;
    }

    // No lane has this branch - show options
    const lanes = listAllLanes();
    const doesBranchExist = branchExists(mainRoot, branchName);

    let selectedAction: any = null;

    const { waitUntilExit, clear } = renderUI(
      React.createElement(CheckoutSelector, {
        branchName,
        branchExists: doesBranchExist,
        lanes,
        onSelect: (action) => {
          selectedAction = action;
        },
      })
    );
    await waitUntilExit();
    clear(); // Clear the UI after selection

    if (!selectedAction || selectedAction.type === "cancel") {
      return;
    }

    if (selectedAction.type === "create-new") {
      // Create new lane with this branch
      const result = await createLane(branchName, { branch: branchName });

      if (!result.success) {
        console.error(chalk.red(`Error: ${result.error}`));
        process.exit(1);
      }

      console.log(chalk.green(`Lane "${branchName}" created!`));
      recordLaneSwitch(mainRoot, currentPath);
      console.log(`${CD_PREFIX}${result.lane?.path}`);
    } else if (selectedAction.type === "checkout-in-lane") {
      // Checkout branch in existing lane
      const lane = selectedAction.lane;
      try {
        // Checkout the branch (create if doesn't exist)
        if (doesBranchExist) {
          execSync(`git checkout "${branchName}"`, { cwd: lane.path, encoding: "utf-8", stdio: "pipe" });
        } else {
          execSync(`git checkout -b "${branchName}"`, { cwd: lane.path, encoding: "utf-8", stdio: "pipe" });
        }

        console.log(chalk.green(`Checked out "${branchName}" in lane "${lane.name}"`));
        recordLaneSwitch(mainRoot, currentPath);
        console.log(`${CD_PREFIX}${lane.path}`);
      } catch (e: any) {
        console.error(chalk.red(`Error checking out branch: ${e.message}`));
        process.exit(1);
      }
    }
  });

// lane edit - interactive management
program
  .command("edit")
  .alias("manage")
  .description("Interactive lane management")
  .action(async () => {
    const lanes = listAllLanes();

    if (lanes.length === 0) {
      console.log(chalk.yellow("No lanes found. Create one with: lane <name>"));
      return;
    }

    const { waitUntilExit } = renderUI(
      React.createElement(LaneManager, {
        lanes,
        onAction: async (action, lane) => {
          if (action === "switch") {
            // Record current lane before switching
            const mainRoot = getMainRepoRoot();
            const currentLane = lanes.find((l) => l.isCurrent);
            if (mainRoot && currentLane) {
              recordLaneSwitch(mainRoot, currentLane.path);
            }
            console.log(`${CD_PREFIX}${lane.path}`);
          } else if (action === "delete") {
            const result = await removeLaneCmd(lane.name, { deleteBranch: true });
            if (result.success) {
              console.log(chalk.green(`Lane "${lane.name}" removed.`));
            } else {
              console.error(chalk.red(`Error: ${result.error}`));
            }
          } else if (action === "sync") {
            const result = await syncLane(lane.name);
            if (result.success) {
              console.log(chalk.green(`Synced ${result.copiedFiles.length} file(s) to "${lane.name}".`));
            } else {
              console.error(chalk.red(`Error: ${result.error}`));
            }
          }
        },
      })
    );
    await waitUntilExit();
  });

// lane config - settings UI
program
  .command("config")
  .alias("settings")
  .description("Configure lane settings")
  .action(async () => {
    const mainRoot = getMainRepoRoot();
    if (!mainRoot) {
      console.error(chalk.red("Not in a git repository"));
      process.exit(1);
    }

    const config = loadConfig(mainRoot);

    const { waitUntilExit } = renderUI(
      React.createElement(Settings, {
        currentMode: config.settings.copyMode,
        autoInstall: config.settings.autoInstall,
        skipBuildArtifacts: config.settings.skipBuildArtifacts,
        onSave: (settings) => {
          config.settings.copyMode = settings.copyMode;
          config.settings.autoInstall = settings.autoInstall;
          config.settings.skipBuildArtifacts = settings.skipBuildArtifacts;
          saveConfig(mainRoot, config);
          console.error(chalk.green("✓ Settings saved"));
        },
      })
    );
    await waitUntilExit();
  });

// Default command: lane <name> - smart create or switch
program
  .argument("[name]", "Lane name to switch to or create (use '-' for previous)")
  .action(async (name: string | undefined) => {
    const mainRoot = getMainRepoRoot();
    const currentPath = process.cwd();

    // If no name provided, show interactive list
    if (!name) {
      const lanes = listAllLanes();

      if (lanes.length === 0) {
        console.log(chalk.yellow("No lanes found. Create one with: lane <name>"));
        return;
      }

      // Store result to output AFTER Ink exits
      let switchToPath: string | null = null;
      let deletedLanes: string[] = [];

      const { waitUntilExit } = renderUI(
        React.createElement(LaneList, {
          lanes,
          onSelect: async (lane, action) => {
            if (action === "switch") {
              if (mainRoot) {
                recordLaneSwitch(mainRoot, currentPath);
              }
              switchToPath = lane.path;
            } else if (action === "delete") {
              const result = await removeLaneCmd(lane.name, { deleteBranch: true });
              if (result.success) {
                deletedLanes.push(lane.name);
              }
            }
          },
          onBulkDelete: async (lanesToDelete) => {
            for (const lane of lanesToDelete) {
              const result = await removeLaneCmd(lane.name, { deleteBranch: true });
              if (result.success) {
                deletedLanes.push(lane.name);
              }
            }
          },
        })
      );
      await waitUntilExit();

      // Output AFTER Ink has fully exited
      if (deletedLanes.length > 0) {
        console.error(chalk.green(`Deleted: ${deletedLanes.join(", ")}`));
      }
      if (switchToPath) {
        console.log(`${CD_PREFIX}${switchToPath}`);
      }
      return;
    }

    // Handle "lane -" to go to previous lane
    if (name === "-") {
      if (!mainRoot) {
        console.error(chalk.red("Not in a git repository"));
        process.exit(1);
      }

      const previousPath = getPreviousLane(mainRoot);
      if (!previousPath) {
        console.error(chalk.red("No previous lane to switch to"));
        process.exit(1);
      }

      // Record current before switching
      recordLaneSwitch(mainRoot, currentPath);
      console.log(`${CD_PREFIX}${previousPath}`);
      return;
    }

    const result = await smartLane(name);

    if (!result.success) {
      console.error(chalk.red(`Error: ${result.error}`));
      process.exit(1);
    }

    if (result.action === "created") {
      console.log(chalk.green(`Lane "${name}" created!`));
      console.log(chalk.dim(`  Branch: ${result.lane?.branch}`));
    }

    // Record current lane before switching
    if (result.path && mainRoot) {
      recordLaneSwitch(mainRoot, currentPath);
    }

    // Output the cd command for shell function
    if (result.path) {
      console.log(`${CD_PREFIX}${result.path}`);
    }
  });

program.parse();
