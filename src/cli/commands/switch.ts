import chalk from "chalk";
import { getLaneForSwitch } from "../../lanes.js";
import { CD_PREFIX } from "../utils.js";

export function registerSwitchCommand(program: any) {
  program
    .command("switch <name>")
    .description("Switch to a lane")
    .action(async (name: string) => {
      const lane = await getLaneForSwitch(name);

      if (!lane) {
        console.error(chalk.red(`Error: Lane "${name}" not found`));
        process.exit(1);
      }

      // Output the cd command for shell function
      console.log(`${CD_PREFIX}${lane.path}`);
    });
}
