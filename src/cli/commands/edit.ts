import chalk from "chalk";
import React from "react";
import { getMainRepoRoot, listAllLanes, removeLaneCmd, syncLane } from "../../lanes.js";
import { LaneManager } from "../../ui/LaneManager.js";
import { recordLaneSwitch } from "../../config.js";
import { renderUI, CD_PREFIX } from "../utils.js";

export function registerEditCommand(program: any) {
  program
    .command("edit")
    .alias("manage")
    .description("Interactive lane management")
    .action(async () => {
      const lanes = await listAllLanes();

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
              const mainRoot = await getMainRepoRoot();
              const currentLane = lanes.find((l) => l.isCurrent);
              if (mainRoot && currentLane) {
                await recordLaneSwitch(mainRoot, currentLane.path);
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
}
