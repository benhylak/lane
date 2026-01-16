import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Box, Text, useInput, useApp, useStdin } from "ink";
export function LaneManager({ lanes, onAction }) {
    const [selectedIndex, setSelectedIndex] = useState(Math.max(0, lanes.findIndex((l) => l.isCurrent)));
    const [mode, setMode] = useState("list");
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
            }
            else {
                setMode("list");
            }
            return;
        }
        if (key.upArrow || input === "k") {
            setSelectedIndex((i) => Math.max(0, i - 1));
        }
        else if (key.downArrow || input === "j") {
            setSelectedIndex((i) => Math.min(lanes.length - 1, i + 1));
        }
        else if (key.return || input === " ") {
            if (!selectedLane.isCurrent) {
                exit();
                onAction("switch", selectedLane);
            }
        }
        else if (input === "d" || input === "x") {
            if (!selectedLane.isMain && !selectedLane.isCurrent) {
                setMode("confirm-delete");
            }
        }
        else if (input === "s") {
            if (!selectedLane.isMain) {
                exit();
                onAction("sync", selectedLane);
            }
        }
        else if (input === "q" || key.escape) {
            exit();
            onAction("cancel", selectedLane);
        }
    });
    if (mode === "confirm-delete") {
        return (_jsxs(Box, { flexDirection: "column", padding: 1, children: [_jsxs(Text, { bold: true, color: "red", children: ["Delete lane \"", selectedLane.name, "\"?"] }), _jsxs(Text, { color: "gray", children: ["This will remove the worktree at ", selectedLane.path] }), _jsx(Box, { marginTop: 1, children: _jsxs(Text, { children: ["Press ", _jsx(Text, { color: "red", bold: true, children: "y" }), " to confirm, any other key to cancel"] }) })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", padding: 1, children: [_jsx(Box, { marginBottom: 1, children: _jsx(Text, { bold: true, color: "blue", children: "Manage Lanes" }) }), lanes.map((lane, index) => {
                const isSelected = index === selectedIndex;
                const pointer = isSelected ? "❯" : " ";
                const nameColor = lane.isCurrent
                    ? "green"
                    : isSelected
                        ? "cyan"
                        : "white";
                return (_jsxs(Box, { flexDirection: "column", children: [_jsxs(Box, { children: [_jsxs(Text, { color: isSelected ? "cyan" : "gray", children: [pointer, " "] }), _jsx(Text, { bold: true, color: nameColor, children: lane.name }), lane.isMain && _jsx(Text, { color: "gray", children: " (main)" }), lane.isCurrent && _jsx(Text, { color: "green", children: " \u2190 current" })] }), isSelected && (_jsxs(Box, { marginLeft: 3, flexDirection: "column", children: [_jsxs(Text, { color: "gray", children: ["Branch: ", lane.branch] }), _jsx(Text, { color: "gray", dimColor: true, children: lane.path })] }))] }, lane.name));
            }), _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [_jsx(Text, { color: "gray", children: "\u2191\u2193/jk: navigate \u2022 Enter/Space: switch \u2022 d: delete \u2022 s: sync \u2022 q: quit" }), selectedLane.isMain && (_jsx(Text, { color: "yellow", dimColor: true, children: "(Cannot delete main repository)" })), selectedLane.isCurrent && !selectedLane.isMain && (_jsx(Text, { color: "yellow", dimColor: true, children: "(Cannot delete current lane)" }))] })] }));
}
