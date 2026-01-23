import chalk from "chalk";
import { syncLane } from "../../lanes.js";

export function registerSyncCommand(program: any) {
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
}
