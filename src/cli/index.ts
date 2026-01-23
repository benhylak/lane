import { Command } from "commander";

// Import command registerers
import { registerNewCommand } from "./commands/new.js";
import { registerSwitchCommand } from "./commands/switch.js";
import { registerListCommand } from "./commands/list.js";
import { registerRemoveCommand } from "./commands/remove.js";
import { registerInitShellCommand } from "./commands/init-shell.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerSyncCommand } from "./commands/sync.js";
import { registerRenameCommand } from "./commands/rename.js";
import { registerCheckoutCommand } from "./commands/checkout.js";
import { registerEditCommand } from "./commands/edit.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerDefaultCommand } from "./commands/default.js";

const program = new Command();

program
  .name("lane")
  .description("A simple alternative to git worktrees")
  .version("0.1.0");

// Register all commands
registerNewCommand(program);
registerSwitchCommand(program);
registerListCommand(program);
registerRemoveCommand(program);
registerInitShellCommand(program);
registerStatusCommand(program);
registerSyncCommand(program);
registerRenameCommand(program);
registerCheckoutCommand(program);
registerEditCommand(program);
registerConfigCommand(program);
registerDefaultCommand(program);

program.parse();
