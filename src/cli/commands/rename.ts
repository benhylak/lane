import chalk from "chalk";
import { getMainRepoRoot, listAllLanes } from "../../lanes.js";
import { CD_PREFIX } from "../utils.js";

export function registerRenameCommand(program: any) {
  program
    .command("rename <new-name>")
    .description("Rename the current lane")
    .action(async (newName: string) => {
      const lanes = await listAllLanes();
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

      const mainRoot = await getMainRepoRoot();
      if (!mainRoot) {
        console.error(chalk.red("Not in a git repository"));
        process.exit(1);
      }

      const { renameLane } = await import("../../lanes.js");
      const result = await renameLane(current.name, newName);

      if (!result.success) {
        console.error(chalk.red(`Error: ${result.error}`));
        process.exit(1);
      }

      console.log(chalk.green(`Renamed "${current.name}" → "${newName}"`));
      // cd to new path
      console.log(`${CD_PREFIX}${result.newPath}`);
    });
}
