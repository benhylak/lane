import chalk from "chalk";
import React from "react";
import { getMainRepoRoot } from "../../lanes.js";
import { loadConfig, saveConfig } from "../../config.js";
import { Settings } from "../../ui/Settings.js";
import { renderUI } from "../utils.js";

export function registerConfigCommand(program: any) {
  program
    .command("config")
    .alias("settings")
    .description("Configure lane settings")
    .action(async () => {
      const mainRoot = await getMainRepoRoot();
      if (!mainRoot) {
        console.error(chalk.red("Not in a git repository"));
        process.exit(1);
      }

      const config = await loadConfig(mainRoot);

      const { waitUntilExit } = renderUI(
        React.createElement(Settings, {
          currentMode: config.settings.copyMode,
          autoInstall: config.settings.autoInstall,
          skipBuildArtifacts: config.settings.skipBuildArtifacts,
          symlinkDeps: config.settings.symlinkDeps,
          onSave: async (settings) => {
            config.settings.copyMode = settings.copyMode;
            config.settings.autoInstall = settings.autoInstall;
            config.settings.skipBuildArtifacts = settings.skipBuildArtifacts;
            config.settings.symlinkDeps = settings.symlinkDeps;
            await saveConfig(mainRoot, config);
            console.error(chalk.green("✓ Settings saved"));
          },
        })
      );
      await waitUntilExit();
    });
}
