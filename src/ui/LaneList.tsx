import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";

interface Lane {
  name: string;
  path: string;
  branch: string;
  isMain: boolean;
  isCurrent: boolean;
}

interface LaneListProps {
  lanes: Lane[];
  onSelect: (lane: Lane) => void;
}

export function LaneList({ lanes, onSelect }: LaneListProps) {
  const [selectedIndex, setSelectedIndex] = useState(
    Math.max(0, lanes.findIndex((l) => l.isCurrent))
  );
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(lanes.length - 1, i + 1));
    } else if (key.return) {
      const selected = lanes[selectedIndex];
      if (selected && !selected.isCurrent) {
        exit();
        onSelect(selected);
      }
    } else if (input === "q" || key.escape) {
      exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="blue">
          Select a lane to switch to:
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

      <Box marginTop={1}>
        <Text color="gray">
          ↑↓/jk: navigate • Enter: switch • q: quit
        </Text>
      </Box>
    </Box>
  );
}
