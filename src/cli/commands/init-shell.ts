import chalk from "chalk";

export function registerInitShellCommand(program: any) {
  program
    .command("init-shell")
    .description("Set up shell integration for automatic cd")
    .option("--print", "Print the shell function instead of installing")
    .action(async (options: { print?: boolean }) => {
      const pathModule = await import("node:path");

      const shell = process.env.SHELL || "";
      const isFish = shell.includes("fish");
      const home = process.env.HOME || process.env.USERPROFILE || "";

      const MARKER = "# >>> lane shell integration >>>";
      const MARKER_END = "# <<< lane shell integration <<<";

      const fishFunction = `${MARKER}
function lane
    set -l result (command lane $argv)
    set -l code $status

    if string match -q "*__lane_cd:*" "$result"
        set -l lines (string split \\n "$result")
        for line in $lines
            if string match -q "__lane_cd:*" "$line"
                cd (string replace "__lane_cd:" "" "$line")
            else
                test -n "$line"; and echo "$line"
            end
        end
    else
        test -n "$result"; and echo "$result"
    end
    return $code
end
${MARKER_END}`;

      const bashZshFunction = `${MARKER}
lane() {
  local result
  result=$(command lane "$@")
  local code=$?
  if [[ "$result" == *__lane_cd:* ]]; then
    local output=""
    local cdpath=""
    while IFS= read -r line; do
      if [[ "$line" == __lane_cd:* ]]; then
        cdpath="\${line#__lane_cd:}"
      else
        [[ -n "$output" ]] && output="$output"$'\\n'
        output="$output$line"
      fi
    done <<< "$result"
    [[ -n "$output" ]] && echo "$output"
    [[ -n "$cdpath" ]] && cd "$cdpath"
  else
    [[ -n "$result" ]] && echo "$result"
  fi
  return $code
}
${MARKER_END}`;

      const shellFunc = isFish ? fishFunction : bashZshFunction;

      // Just print if requested
      if (options.print) {
        console.log(shellFunc);
        return;
      }

      // Determine config file
      let configFile: string;
      if (isFish) {
        const fishConfigDir = pathModule.join(home, ".config", "fish");
        // Ensure fish config dir exists
        await Bun.write(`${fishConfigDir}/.gitkeep`, "", { createPath: true });
        configFile = pathModule.join(fishConfigDir, "config.fish");
      } else if (shell.includes("zsh")) {
        configFile = pathModule.join(home, ".zshrc");
      } else {
        configFile = pathModule.join(home, ".bashrc");
      }

      // Check if already installed
      let existingContent = "";
      const configFileHandle = Bun.file(configFile);
      if (await configFileHandle.exists()) {
        existingContent = await configFileHandle.text();
        if (existingContent.includes(MARKER)) {
          // Remove old version
          const regex = new RegExp(
            `${MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${MARKER_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`,
            "g"
          );
          existingContent = existingContent.replace(regex, "");
        }
      }

      // Append new function
      const newContent = existingContent.trimEnd() + "\n\n" + shellFunc + "\n";
      await Bun.write(configFile, newContent);

      console.log(chalk.green(`✓ Shell integration installed to ${configFile}`));
      console.log();
      console.log("Run this to activate (or restart your terminal):");
      console.log(chalk.cyan(`  source ${configFile}`));
    });
}
