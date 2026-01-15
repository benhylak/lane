import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
export function LaneList({ lanes, onSelect }) {
    const [selectedIndex, setSelectedIndex] = useState(Math.max(0, lanes.findIndex((l) => l.isCurrent)));
    const { exit } = useApp();
    useInput((input, key) => {
        if (key.upArrow || input === "k") {
            setSelectedIndex((i) => Math.max(0, i - 1));
        }
        else if (key.downArrow || input === "j") {
            setSelectedIndex((i) => Math.min(lanes.length - 1, i + 1));
        }
        else if (key.return) {
            const selected = lanes[selectedIndex];
            if (selected && !selected.isCurrent) {
                exit();
                onSelect(selected);
            }
        }
        else if (input === "q" || key.escape) {
            exit();
        }
    });
    return (_jsxs(Box, { flexDirection: "column", padding: 1, children: [_jsx(Box, { marginBottom: 1, children: _jsx(Text, { bold: true, color: "blue", children: "Select a lane to switch to:" }) }), lanes.map((lane, index) => {
                const isSelected = index === selectedIndex;
                const pointer = isSelected ? "❯" : " ";
                const nameColor = lane.isCurrent
                    ? "green"
                    : isSelected
                        ? "cyan"
                        : "white";
                return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Box, { children: [_jsxs(Text, { color: isSelected ? "cyan" : "gray", children: [pointer, " "] }), _jsx(Text, { bold: true, color: nameColor, children: lane.name }), lane.isMain && _jsx(Text, { color: "gray", children: " (main)" }), lane.isCurrent && _jsx(Text, { color: "green", children: " \u2190 current" })] }), isSelected && (_jsxs(Box, { marginLeft: 3, flexDirection: "column", children: [_jsxs(Text, { color: "gray", children: ["Branch: ", lane.branch] }), _jsx(Text, { color: "gray", dimColor: true, children: lane.path })] }))] }, lane.name));
            }), _jsx(Box, { marginTop: 1, children: _jsx(Text, { color: "gray", children: "\u2191\u2193/jk: navigate \u2022 Enter: switch \u2022 q: quit" }) })] }));
}
