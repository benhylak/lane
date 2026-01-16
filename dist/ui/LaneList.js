import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Box, Text, useInput, useApp, useStdin } from "ink";
export function LaneList({ lanes, onSelect, onBulkDelete }) {
    const [selectedIndex, setSelectedIndex] = useState(Math.max(0, lanes.findIndex((l) => l.isCurrent)));
    const [checked, setChecked] = useState(new Set());
    const [mode, setMode] = useState("navigate");
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
                }
                else if (deletableLanes.length === 1) {
                    onSelect(deletableLanes[0], "delete");
                }
                exit();
            }
            else {
                setMode(checked.size > 0 ? "select" : "navigate");
            }
            return;
        }
        // Navigation
        if (key.upArrow || input === "k") {
            setSelectedIndex((i) => Math.max(0, i - 1));
        }
        else if (key.downArrow || input === "j") {
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
                }
                else {
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
            }
            else {
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
            }
            else if (selectedLane && !selectedLane.isMain && !selectedLane.isCurrent) {
                setChecked(new Set([selectedLane.name]));
                setMode("confirm-delete");
            }
        }
        // Escape to clear selection or quit
        else if (key.escape) {
            if (checked.size > 0) {
                setChecked(new Set());
                setMode("navigate");
            }
            else {
                exit();
            }
        }
        // q to quit
        else if (input === "q") {
            exit();
        }
    });
    if (mode === "confirm-delete") {
        return (_jsxs(Box, { flexDirection: "column", padding: 1, children: [_jsxs(Text, { bold: true, color: "red", children: ["Delete ", deletableLanes.length, " lane", deletableLanes.length !== 1 ? "s" : "", "?"] }), _jsx(Box, { flexDirection: "column", marginY: 1, children: deletableLanes.map((lane) => (_jsxs(Text, { color: "yellow", children: ["  \u2022 ", lane.name] }, lane.name))) }), _jsx(Text, { color: "gray", children: "This will remove the directories and branches." }), _jsx(Box, { marginTop: 1, children: _jsxs(Text, { children: ["Press ", _jsx(Text, { color: "red", bold: true, children: "y" }), " to confirm, any other key to cancel"] }) })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", padding: 1, children: [_jsx(Box, { marginBottom: 1, children: _jsx(Text, { bold: true, color: "blue", children: mode === "select" ? `${checked.size} selected` : "Lanes" }) }), lanes.map((lane, index) => {
                const isSelected = index === selectedIndex;
                const isChecked = checked.has(lane.name);
                const checkbox = lane.isMain ? "  " : isChecked ? "☑ " : "☐ ";
                const pointer = isSelected ? "❯" : " ";
                let nameColor = "white";
                if (lane.isCurrent)
                    nameColor = "green";
                else if (isChecked)
                    nameColor = "yellow";
                else if (isSelected)
                    nameColor = "cyan";
                return (_jsxs(Box, { children: [_jsx(Text, { color: isSelected ? "cyan" : "gray", children: pointer }), _jsx(Text, { color: isChecked ? "yellow" : "gray", children: checkbox }), _jsx(Text, { bold: true, color: nameColor, children: lane.name }), lane.branch && (_jsxs(Text, { color: "gray", children: [" [", lane.branch, "]"] })), lane.isMain && _jsx(Text, { color: "magenta", children: " \u2605" }), lane.isCurrent && _jsx(Text, { color: "green", children: " \u2190 here" })] }, lane.name));
            }), _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [_jsx(Text, { color: "gray", children: "\u2191\u2193 move \u2022 Space select \u2022 a all \u2022 Enter switch \u2022 d delete \u2022 q quit" }), checked.size > 0 && (_jsxs(Text, { color: "yellow", children: [deletableLanes.length, " selected (d to delete, Esc to clear)"] }))] })] }));
}
