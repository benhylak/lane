import chalk from "chalk";
import { removeLaneCmd } from "../../lanes.js";

export function registerRemoveCommand(program: any) {
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
}
