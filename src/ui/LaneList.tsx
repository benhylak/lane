import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp, useStdin } from "ink";

interface Lane {
  name: string;
  path: string;
  branch: string;
  isMain: boolean;
  isCurrent: boolean;
}

type Action = "switch" | "delete" | "none";

interface LaneListProps {
  lanes: Lane[];
  onSelect: (lane: Lane, action: Action) => void;
  onBulkDelete?: (lanes: Lane[]) => void;
}

export function LaneList({ lanes, onSelect, onBulkDelete }: LaneListProps) {
  const [selectedIndex, setSelectedIndex] = useState(
    Math.max(0, lanes.findIndex((l) => l.isCurrent))
  );
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"navigate" | "select" | "confirm-delete">("navigate");
  const { exit } = useApp();
  const { isRawModeSupported } = useStdin();

  const selectedLane = lanes[selectedIndex];
  const checkedLanes = lanes.filter((l) => checked.has(l.name));
  const deletableLanes = checkedLanes.filter((l) => !l.isMain && !l.isCurrent);

  useEffect(() => {
    if (!isRawModeSupported) {
      exit();
    }
  }, [isRawModeSupported, exit]);

  useInput((input, key) => {
    if (mode === "confirm-delete") {
      if (input === "y" || input === "Y") {
        if (deletableLanes.length > 0 && onBulkDelete) {
          onBulkDelete(deletableLanes);
        } else if (deletableLanes.length === 1) {
          onSelect(deletableLanes[0], "delete");
        }
        exit();
      } else {
        setMode(checked.size > 0 ? "select" : "navigate");
      }
      return;
    }

    // Navigation
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(lanes.length - 1, i + 1));
    }
    // Enter to switch (only in navigate mode with no selections)
    else if (key.return && mode === "navigate" && checked.size === 0) {
      if (selectedLane) {
        onSelect(selectedLane, "switch");
        exit();
      }
    }
    // Space to toggle checkbox
    else if (input === " ") {
      if (selectedLane && !selectedLane.isMain) {
        const newChecked = new Set(checked);
        if (newChecked.has(selectedLane.name)) {
          newChecked.delete(selectedLane.name);
        } else {
          newChecked.add(selectedLane.name);
        }
        setChecked(newChecked);
        setMode(newChecked.size > 0 ? "select" : "navigate");
      }
    }
    // a to select all (non-main, non-current)
    else if (input === "a") {
      const allDeletable = lanes.filter(l => !l.isMain && !l.isCurrent);
      if (checked.size === allDeletable.length) {
        // Deselect all if all selected
        setChecked(new Set());
        setMode("navigate");
      } else {
        setChecked(new Set(allDeletable.map(l => l.name)));
        setMode("select");
      }
    }
    // d/x to delete selected
    else if (input === "d" || input === "x") {
      if (checked.size > 0) {
        if (deletableLanes.length > 0) {
          setMode("confirm-delete");
        }
      } else if (selectedLane && !selectedLane.isMain && !selectedLane.isCurrent) {
        setChecked(new Set([selectedLane.name]));
        setMode("confirm-delete");
      }
    }
    // Escape to clear selection or quit
    else if (key.escape) {
      if (checked.size > 0) {
        setChecked(new Set());
        setMode("navigate");
      } else {
        exit();
      }
    }
    // q to quit
    else if (input === "q") {
      exit();
    }
  });

  if (mode === "confirm-delete") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="red">
          Delete {deletableLanes.length} lane{deletableLanes.length !== 1 ? "s" : ""}?
        </Text>
        <Box flexDirection="column" marginY={1}>
          {deletableLanes.map((lane) => (
            <Text key={lane.name} color="yellow">  • {lane.name}</Text>
          ))}
        </Box>
        <Text color="gray">This will remove the directories and branches.</Text>
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
          {mode === "select" ? `${checked.size} selected` : "Lanes"}
        </Text>
      </Box>

      {lanes.map((lane, index) => {
        const isSelected = index === selectedIndex;
        const isChecked = checked.has(lane.name);
        const checkbox = lane.isMain ? "  " : isChecked ? "☑ " : "☐ ";
        const pointer = isSelected ? "❯" : " ";

        let nameColor: string = "white";
        if (lane.isCurrent) nameColor = "green";
        else if (isChecked) nameColor = "yellow";
        else if (isSelected) nameColor = "cyan";

        return (
          <Box key={lane.name}>
            <Text color={isSelected ? "cyan" : "gray"}>{pointer}</Text>
            <Text color={isChecked ? "yellow" : "gray"}>{checkbox}</Text>
            <Text bold color={nameColor}>
              {lane.name}
            </Text>
            {lane.branch && (
              <Text color="gray"> [{lane.branch}]</Text>
            )}
            {lane.isMain && <Text color="magenta"> ★</Text>}
            {lane.isCurrent && <Text color="green"> ← here</Text>}
          </Box>
        );
      })}

      <Box marginTop={1} flexDirection="column">
        <Text color="gray">
          ↑↓ move • Space select • a all • Enter switch • d delete • q quit
        </Text>
        {checked.size > 0 && (
          <Text color="yellow">
            {deletableLanes.length} selected (d to delete, Esc to clear)
          </Text>
        )}
      </Box>
    </Box>
  );
}
