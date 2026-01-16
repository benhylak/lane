import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

// Simple spinner component
function Spinner() {
  const [frame, setFrame] = useState(0);
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % frames.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return <Text color="cyan">{frames[frame]}</Text>;
}

type Phase = "register" | "worktree" | "find" | "copy" | "install" | "done" | "error";

interface CreateLaneUIProps {
  laneName: string;
  onComplete: () => void;
  // These will be called by parent to update state
  phase: Phase;
  progress?: {
    current: number;
    total: number;
    currentItem?: string;
  };
  itemsToCopy?: string[];
  skippedCount?: number;
  error?: string;
  branchName?: string;
  installingPkg?: string;
}

export function CreateLaneUI({
  laneName,
  phase,
  progress,
  itemsToCopy,
  skippedCount,
  error,
  branchName,
  installingPkg,
  onComplete,
}: CreateLaneUIProps) {
  const phases: { key: Phase; label: string }[] = [
    { key: "register", label: "Registering lane" },
    { key: "worktree", label: "Creating worktree" },
    { key: "find", label: "Finding local files" },
    { key: "copy", label: "Copying files" },
    { key: "install", label: "Installing dependencies" },
    { key: "done", label: "Done" },
  ];

  const getPhaseIndex = (p: Phase) => phases.findIndex((x) => x.key === p);
  const currentIndex = getPhaseIndex(phase);

  useEffect(() => {
    if (phase === "done") {
      onComplete();
    }
  }, [phase, onComplete]);

  if (phase === "error") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>✗ Failed to create lane "{laneName}"</Text>
        <Text color="red">{error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="blue">Creating lane </Text>
        <Text bold color="cyan">{laneName}</Text>
        {branchName && branchName !== laneName && (
          <Text color="gray"> (branch: {branchName})</Text>
        )}
      </Box>

      {phases.slice(0, -1).map((p, idx) => {
        const isActive = idx === currentIndex;
        const isDone = idx < currentIndex;
        const isPending = idx > currentIndex;

        let icon = "○";
        let color: string = "gray";

        if (isDone) {
          icon = "✓";
          color = "green";
        } else if (isActive) {
          icon = "●";
          color = "cyan";
        }

        return (
          <Box key={p.key}>
            <Text color={color}>{isDone ? "✓ " : isActive ? <><Spinner /> </> : "○ "}</Text>
            <Text color={isPending ? "gray" : "white"}>{p.label}</Text>

            {/* Show extra info for active phases */}
            {isActive && p.key === "copy" && progress && (
              <Text color="gray"> ({progress.current}/{progress.total})</Text>
            )}
            {isActive && p.key === "install" && installingPkg && (
              <Text color="gray"> ({installingPkg})</Text>
            )}
          </Box>
        );
      })}

      {/* Show files being copied */}
      {phase === "find" && itemsToCopy && itemsToCopy.length > 0 && (
        <Box flexDirection="column" marginLeft={2} marginTop={1}>
          <Text color="gray">Found {itemsToCopy.length} items to copy:</Text>
          {itemsToCopy.slice(0, 4).map((item) => (
            <Text key={item} color="gray">  {item}</Text>
          ))}
          {itemsToCopy.length > 4 && (
            <Text color="gray">  (+{itemsToCopy.length - 4} more)</Text>
          )}
          {skippedCount !== undefined && skippedCount > 0 && (
            <Text color="gray">Skipping {skippedCount} build artifacts</Text>
          )}
        </Box>
      )}

      {/* Progress bar for copy */}
      {phase === "copy" && progress && (
        <Box marginLeft={2} marginTop={1}>
          <Text color="gray">
            {progress.currentItem?.slice(0, 40)}
          </Text>
        </Box>
      )}

      {phase === "done" && (
        <Box marginTop={1}>
          <Text color="green" bold>✓ Lane ready!</Text>
        </Box>
      )}
    </Box>
  );
}
