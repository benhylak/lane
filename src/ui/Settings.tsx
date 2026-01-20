import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { CopyMode } from "../config.js";

interface SettingsProps {
  currentMode: CopyMode;
  autoInstall: boolean;
  skipBuildArtifacts: boolean;
  symlinkDeps: boolean;
  onSave: (settings: { copyMode: CopyMode; autoInstall: boolean; skipBuildArtifacts: boolean; symlinkDeps: boolean }) => void;
}

export function Settings({ currentMode, autoInstall, skipBuildArtifacts, symlinkDeps, onSave }: SettingsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copyMode, setCopyMode] = useState<CopyMode>(currentMode);
  const [install, setInstall] = useState(autoInstall);
  const [skipArtifacts, setSkipArtifacts] = useState(skipBuildArtifacts);
  const [symlink, setSymlink] = useState(symlinkDeps);
  const { exit } = useApp();

  const options = [
    {
      key: "copyMode",
      label: "Copy Mode",
      value: copyMode,
      options: ["worktree", "full"] as CopyMode[],
      descriptions: {
        worktree: "Fast: git worktree + copy untracked files",
        full: "Full copy: copies entire repo directory",
      },
    },
    {
      key: "skipBuildArtifacts",
      label: "Skip Build Artifacts",
      value: skipArtifacts ? "yes" : "no",
      options: ["no", "yes"],
      descriptions: {
        yes: "Skip node_modules, dist, .next, etc (run install instead)",
        no: "Copy everything including build artifacts",
      },
    },
    {
      key: "autoInstall",
      label: "Auto Install",
      value: install ? "yes" : "no",
      options: ["yes", "no"],
      descriptions: {
        yes: "Run package manager install after creating lane",
        no: "Skip automatic dependency installation",
      },
    },
    {
      key: "symlinkDeps",
      label: "Symlink Dependencies",
      value: symlink ? "yes" : "no",
      options: ["no", "yes"],
      descriptions: {
        yes: "Create symlinks to main repo's node_modules (fast, saves disk space)",
        no: "Copy or install dependencies separately for each lane",
      },
    },
  ];

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (key.leftArrow || input === "h" || key.rightArrow || input === "l") {
      const opt = options[selectedIndex];
      const currentIdx = opt.options.indexOf(opt.value as any);
      const direction = (key.leftArrow || input === "h") ? -1 : 1;
      const newIdx = Math.max(0, Math.min(opt.options.length - 1, currentIdx + direction));

      if (opt.key === "copyMode") {
        setCopyMode(opt.options[newIdx] as CopyMode);
      } else if (opt.key === "skipBuildArtifacts") {
        setSkipArtifacts(opt.options[newIdx] === "yes");
      } else if (opt.key === "autoInstall") {
        setInstall(opt.options[newIdx] === "yes");
      } else if (opt.key === "symlinkDeps") {
        setSymlink(opt.options[newIdx] === "yes");
      }
    } else if (key.return || input === "s") {
      onSave({ copyMode, autoInstall: install, skipBuildArtifacts: skipArtifacts, symlinkDeps: symlink });
      exit();
    } else if (input === "q" || key.escape) {
      exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="blue">Lane Settings</Text>
      </Box>

      {options.map((opt, idx) => {
        const isSelected = idx === selectedIndex;
        const desc = opt.descriptions[opt.value as keyof typeof opt.descriptions];

        return (
          <Box key={opt.key} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={isSelected ? "cyan" : "gray"}>{isSelected ? "❯ " : "  "}</Text>
              <Text bold color={isSelected ? "white" : "gray"}>{opt.label}: </Text>
              <Text color="yellow">{opt.value}</Text>
              <Text color="gray"> (←/→ to change)</Text>
            </Box>
            <Box marginLeft={4}>
              <Text color="gray">{desc}</Text>
            </Box>
          </Box>
        );
      })}

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">↑↓ navigate • ←→ change • Enter save • q cancel</Text>
      </Box>
    </Box>
  );
}
