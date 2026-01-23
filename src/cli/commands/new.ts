import chalk from "chalk";
import { createLane } from "../../lanes.js";
import { CD_PREFIX } from "../utils.js";

export function registerNewCommand(program: any) {
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
}
