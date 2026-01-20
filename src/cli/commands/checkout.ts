import chalk from "chalk";
import React from "react";
import { getMainRepoRoot, listAllLanes, findLaneByBranch, createLane } from "../../lanes.js";
import { branchExists } from "../../git.js";
import { CheckoutSelector } from "../../ui/CheckoutSelector.js";
import { renderUI, CD_PREFIX } from "../utils.js";

export function registerCheckoutCommand(program: any) {
  program
    .command("checkout <branch>")
    .alias("co")
    .description("Switch to lane with branch, or choose where to checkout")
    .action(async (branchName: string) => {
      const mainRoot = await getMainRepoRoot();
      const currentPath = process.cwd();

      if (!mainRoot) {
        console.error(chalk.red("Not in a git repository"));
        process.exit(1);
      }

      // Check if any lane has this branch currently checked out
      const laneWithBranch = await findLaneByBranch(branchName);

      if (laneWithBranch) {
        // Found a lane with this branch - switch to it
        console.log(chalk.green(`Switching to lane "${laneWithBranch.name}" (branch: ${branchName})`));
        const { recordLaneSwitch } = await import("../../config.js");
        await recordLaneSwitch(mainRoot, currentPath);
        console.log(`${CD_PREFIX}${laneWithBranch.path}`);
        return;
      }

      // No lane has this branch - show options
      const lanes = await listAllLanes();
      const doesBranchExist = await branchExists(mainRoot, branchName);

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
        const { recordLaneSwitch } = await import("../../config.js");
        await recordLaneSwitch(mainRoot, currentPath);
        console.log(`${CD_PREFIX}${result.lane?.path}`);
      } else if (selectedAction.type === "checkout-in-lane") {
        // Checkout branch in existing lane
        const lane = selectedAction.lane;
        try {
          // Checkout the branch (create if doesn't exist)
          const gitCmd = doesBranchExist
            ? `git checkout "${branchName}"`
            : `git checkout -b "${branchName}"`;

          const proc = Bun.spawn(["sh", "-c", gitCmd], {
            cwd: lane.path,
            stdout: "pipe",
            stderr: "pipe",
          });
          const exitCode = await proc.exited;
          if (exitCode !== 0) {
            const stderr = await new Response(proc.stderr).text();
            throw new Error(stderr || "Git checkout failed");
          }

          console.log(chalk.green(`Checked out "${branchName}" in lane "${lane.name}"`));
          const { recordLaneSwitch } = await import("../../config.js");
          await recordLaneSwitch(mainRoot, currentPath);
          console.log(`${CD_PREFIX}${lane.path}`);
        } catch (e: any) {
          console.error(chalk.red(`Error checking out branch: ${e.message}`));
          process.exit(1);
        }
      }
    });
}
