import chalk from "chalk";
import { getMainRepoRoot, listAllLanes } from "../../lanes.js";

export function registerStatusCommand(program: any) {
  program
    .command("status")
    .description("Show current lane status")
    .action(async () => {
      const mainRoot = await getMainRepoRoot();
      if (!mainRoot) {
        console.error(chalk.red("Not in a git repository"));
        process.exit(1);
      }

      const lanes = await listAllLanes();
      const current = lanes.find((l) => l.isCurrent);

      if (current) {
        console.log(chalk.bold("Current lane:"), chalk.cyan(current.name));
        console.log(chalk.dim(`  Branch: ${current.branch}`));
        console.log(chalk.dim(`  Path: ${current.path}`));
      } else {
        console.log(chalk.yellow("Not in a known lane"));
      }
    });
}
