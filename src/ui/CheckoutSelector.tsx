import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";

interface Lane {
  name: string;
  path: string;
  branch: string;
  isMain: boolean;
  isCurrent: boolean;
}

type CheckoutAction =
  | { type: "create-new"; branchName: string }
  | { type: "checkout-in-lane"; lane: Lane; branchName: string }
  | { type: "cancel" };

interface CheckoutSelectorProps {
  branchName: string;
  branchExists: boolean;
  lanes: Lane[];
  onSelect: (action: CheckoutAction) => void;
}

export function CheckoutSelector({
  branchName,
  branchExists,
  lanes,
  onSelect,
}: CheckoutSelectorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { exit } = useApp();

  // Build options
  const options: Array<{
    label: string;
    description: string;
    action: CheckoutAction;
  }> = [];

  // Option 1: Create new lane with this branch
  if (branchExists) {
    options.push({
      label: `Create new lane "${branchName}"`,
      description: "Create a new lane and checkout this existing branch",
      action: { type: "create-new", branchName },
    });
  } else {
    options.push({
      label: `Create new lane "${branchName}"`,
      description: "Create a new lane with a new branch",
      action: { type: "create-new", branchName },
    });
  }

  // Option 2+: Checkout in existing lanes (non-main, non-current)
  const availableLanes = lanes.filter((l) => !l.isMain && !l.isCurrent);
  for (const lane of availableLanes) {
    options.push({
      label: `Checkout in "${lane.name}"`,
      description: `Currently on branch: ${lane.branch}`,
      action: { type: "checkout-in-lane", lane, branchName },
    });
  }

  useInput((input, key) => {
    if (key.upArrow || input === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === "j") {
      setSelectedIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (key.return) {
      onSelect(options[selectedIndex].action);
      exit();
    } else if (input === "q" || key.escape) {
      onSelect({ type: "cancel" });
      exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="blue">
          Branch "{branchName}" {branchExists ? "exists" : "doesn't exist"}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color="gray">No lane currently has this branch checked out.</Text>
      </Box>

      {options.map((opt, index) => {
        const isSelected = index === selectedIndex;
        return (
          <Box key={index} flexDirection="column" marginBottom={1}>
            <Box>
              <Text color={isSelected ? "cyan" : "gray"}>
                {isSelected ? "❯ " : "  "}
              </Text>
              <Text bold color={isSelected ? "white" : "gray"}>
                {opt.label}
              </Text>
            </Box>
            <Box marginLeft={4}>
              <Text color="gray">{opt.description}</Text>
            </Box>
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text color="gray">↑↓ navigate • Enter select • q cancel</Text>
      </Box>
    </Box>
  );
}
