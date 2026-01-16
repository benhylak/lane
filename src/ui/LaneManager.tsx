import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp, useStdin } from "ink";

interface Lane {
  name: string;
  path: string;
  branch: string;
  isMain: boolean;
  isCurrent: boolean;
}

type Action = "switch" | "delete" | "sync" | "cancel";

interface LaneManagerProps {
  lanes: Lane[];
  onAction: (action: Action, lane: Lane) => void;
}

export function LaneManager({ lanes, onAction }: LaneManagerProps) {
  const [selectedIndex, setSelectedIndex] = useState(
    Math.max(0, lanes.findIndex((l) => l.isCurrent))
  );
  const [mode, setMode] = useState<"list" | "confirm-delete">("list");
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();

  const selectedLane = lanes[selectedIndex];

  useEffect(() => {
    if (!isRawModeSupported) {
      exit();
    }
  }, [isRawModeSupported, exit]);

  useInput((input, key) => {
    if (mode === "confirm-delete") {
      if (input === "y" || input === "Y") {
        onAction("delete", selectedLane);
        exit();
      } else {
        setMode("list");
      }
      return;
    }

    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(lanes.length - 1, i + 1));
    } else if (key.return || input === " ") {
      if (!selectedLane.isCurrent) {
        exit();
        onAction("switch", selectedLane);
      }
    } else if (input === "d" || input === "x") {
      if (!selectedLane.isMain && !selectedLane.isCurrent) {
        setMode("confirm-delete");
      }
    } else if (input === "s") {
      if (!selectedLane.isMain) {
        exit();
        onAction("sync", selectedLane);
      }
    } else if (input === "q" || key.escape) {
      exit();
      onAction("cancel", selectedLane);
    }
  });

  if (mode === "confirm-delete") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="red">
          Delete lane "{selectedLane.name}"?
        </Text>
        <Text color="gray">
          This will remove the worktree at {selectedLane.path}
        </Text>
        <Box marginTop={1}>
          <Text>
            Press <Text color="red" bold>y</Text> to confirm, any other key to cancel
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="blue">
          Manage Lanes
        </Text>
      </Box>

      {lanes.map((lane, index) => {
        const isSelected = index === selectedIndex;
        const pointer = isSelected ? "❯" : " ";
        const nameColor = lane.isCurrent
          ? "green"
          : isSelected
          ? "cyan"
          : "white";

        return (
          <Box key={lane.name} flexDirection="column">
            <Box>
              <Text color={isSelected ? "cyan" : "gray"}>{pointer} </Text>
              <Text bold color={nameColor}>
                {lane.name}
              </Text>
              {lane.isMain && <Text color="gray"> (main)</Text>}
              {lane.isCurrent && <Text color="green"> ← current</Text>}
            </Box>
            {isSelected && (
              <Box marginLeft={3} flexDirection="column">
                <Text color="gray">Branch: {lane.branch}</Text>
                <Text color="gray" dimColor>
                  {lane.path}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">
          ↑↓/jk: navigate • Enter/Space: switch • d: delete • s: sync • q: quit
        </Text>
        {selectedLane.isMain && (
          <Text color="yellow" dimColor>
            (Cannot delete main repository)
          </Text>
        )}
        {selectedLane.isCurrent && !selectedLane.isMain && (
          <Text color="yellow" dimColor>
            (Cannot delete current lane)
          </Text>
        )}
      </Box>
    </Box>
  );
}
