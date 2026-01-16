import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from "react";
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
    return _jsx(Text, { color: "cyan", children: frames[frame] });
}
export function CreateLaneUI({ laneName, phase, progress, itemsToCopy, skippedCount, error, branchName, installingPkg, onComplete, }) {
    const phases = [
        { key: "register", label: "Registering lane" },
        { key: "worktree", label: "Creating worktree" },
        { key: "find", label: "Finding local files" },
        { key: "copy", label: "Copying files" },
        { key: "install", label: "Installing dependencies" },
        { key: "done", label: "Done" },
    ];
    const getPhaseIndex = (p) => phases.findIndex((x) => x.key === p);
    const currentIndex = getPhaseIndex(phase);
    useEffect(() => {
        if (phase === "done") {
            onComplete();
        }
    }, [phase, onComplete]);
    if (phase === "error") {
        return (_jsxs(Box, { flexDirection: "column", padding: 1, children: [_jsxs(Text, { color: "red", bold: true, children: ["\u2717 Failed to create lane \"", laneName, "\""] }), _jsx(Text, { color: "red", children: error })] }));
    }
    return (_jsxs(Box, { flexDirection: "column", padding: 1, children: [_jsxs(Box, { marginBottom: 1, children: [_jsx(Text, { bold: true, color: "blue", children: "Creating lane " }), _jsx(Text, { bold: true, color: "cyan", children: laneName }), branchName && branchName !== laneName && (_jsxs(Text, { color: "gray", children: [" (branch: ", branchName, ")"] }))] }), phases.slice(0, -1).map((p, idx) => {
                const isActive = idx === currentIndex;
                const isDone = idx < currentIndex;
                const isPending = idx > currentIndex;
                let icon = "○";
                let color = "gray";
                if (isDone) {
                    icon = "✓";
                    color = "green";
                }
                else if (isActive) {
                    icon = "●";
                    color = "cyan";
                }
                return (_jsxs(Box, { children: [_jsx(Text, { color: color, children: isDone ? "✓ " : isActive ? _jsxs(_Fragment, { children: [_jsx(Spinner, {}), " "] }) : "○ " }), _jsx(Text, { color: isPending ? "gray" : "white", children: p.label }), isActive && p.key === "copy" && progress && (_jsxs(Text, { color: "gray", children: [" (", progress.current, "/", progress.total, ")"] })), isActive && p.key === "install" && installingPkg && (_jsxs(Text, { color: "gray", children: [" (", installingPkg, ")"] }))] }, p.key));
            }), phase === "find" && itemsToCopy && itemsToCopy.length > 0 && (_jsxs(Box, { flexDirection: "column", marginLeft: 2, marginTop: 1, children: [_jsxs(Text, { color: "gray", children: ["Found ", itemsToCopy.length, " items to copy:"] }), itemsToCopy.slice(0, 4).map((item) => (_jsxs(Text, { color: "gray", children: ["  ", item] }, item))), itemsToCopy.length > 4 && (_jsxs(Text, { color: "gray", children: ["  (+", itemsToCopy.length - 4, " more)"] })), skippedCount !== undefined && skippedCount > 0 && (_jsxs(Text, { color: "gray", children: ["Skipping ", skippedCount, " build artifacts"] }))] })), phase === "copy" && progress && (_jsx(Box, { marginLeft: 2, marginTop: 1, children: _jsx(Text, { color: "gray", children: progress.currentItem?.slice(0, 40) }) })), phase === "done" && (_jsx(Box, { marginTop: 1, children: _jsx(Text, { color: "green", bold: true, children: "\u2713 Lane ready!" }) }))] }));
}
