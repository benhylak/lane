import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
export function CheckoutSelector({ branchName, branchExists, lanes, onSelect, }) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const { exit } = useApp();
    // Build options
    const options = [];
    // Option 1: Create new lane with this branch
    if (branchExists) {
        options.push({
            label: `Create new lane "${branchName}"`,
            description: "Create a new lane and checkout this existing branch",
            action: { type: "create-new", branchName },
        });
    }
    else {
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
        }
        else if (key.downArrow || input === "j") {
            setSelectedIndex((i) => Math.min(options.length - 1, i + 1));
        }
        else if (key.return) {
            onSelect(options[selectedIndex].action);
            exit();
        }
        else if (input === "q" || key.escape) {
            onSelect({ type: "cancel" });
            exit();
        }
    });
    return (_jsxs(Box, { flexDirection: "column", padding: 1, children: [_jsx(Box, { marginBottom: 1, children: _jsxs(Text, { bold: true, color: "blue", children: ["Branch \"", branchName, "\" ", branchExists ? "exists" : "doesn't exist"] }) }), _jsx(Box, { marginBottom: 1, children: _jsx(Text, { color: "gray", children: "No lane currently has this branch checked out." }) }), options.map((opt, index) => {
                const isSelected = index === selectedIndex;
                return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsxs(Box, { children: [_jsx(Text, { color: isSelected ? "cyan" : "gray", children: isSelected ? "❯ " : "  " }), _jsx(Text, { bold: true, color: isSelected ? "white" : "gray", children: opt.label })] }), _jsx(Box, { marginLeft: 4, children: _jsx(Text, { color: "gray", children: opt.description }) })] }, index));
            }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: "gray", children: "\u2191\u2193 navigate \u2022 Enter select \u2022 q cancel" }) })] }));
}
