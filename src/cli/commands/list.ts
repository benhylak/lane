import chalk from "chalk";
import React from "react";
import { listAllLanes } from "../../lanes.js";
import { LaneList } from "../../ui/LaneList.js";
import { renderUI, CD_PREFIX } from "../utils.js";

export function registerListCommand(program: any) {
  program
    .command("list")
    .alias("ls")
    .description("List all lanes")
    .option("-i, --interactive", "Show interactive UI")
    .action(async (options: { interactive?: boolean }) => {
      const lanes = await listAllLanes();

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
}
