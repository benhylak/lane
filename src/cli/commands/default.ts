import chalk from "chalk";
import React from "react";
import { getMainRepoRoot, listAllLanes, smartLane, removeLaneCmd } from "../../lanes.js";
import { getPreviousLane, recordLaneSwitch } from "../../config.js";
import { LaneList } from "../../ui/LaneList.js";
import { renderUI, CD_PREFIX } from "../utils.js";

export function registerDefaultCommand(program: any) {
  program
    .argument("[name]", "Lane name to switch to or create (use '-' for previous)")
    .action(async (name: string | undefined) => {
      const mainRoot = await getMainRepoRoot();
      const currentPath = process.cwd();

      // If no name provided, show interactive list
      if (!name) {
        const lanes = await listAllLanes();

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
                  await recordLaneSwitch(mainRoot, currentPath);
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

        const previousPath = await getPreviousLane(mainRoot);
        if (!previousPath) {
          console.error(chalk.red("No previous lane to switch to"));
          process.exit(1);
        }

        // Record current before switching
        await recordLaneSwitch(mainRoot, currentPath);
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
        await recordLaneSwitch(mainRoot, currentPath);
      }

      // Output the cd command for shell function
      if (result.path) {
        console.log(`${CD_PREFIX}${result.path}`);
      }
    });
}
