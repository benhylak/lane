import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
export function Settings({ currentMode, autoInstall, skipBuildArtifacts, onSave }) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [copyMode, setCopyMode] = useState(currentMode);
    const [install, setInstall] = useState(autoInstall);
    const [skipArtifacts, setSkipArtifacts] = useState(skipBuildArtifacts);
    const { exit } = useApp();
    const options = [
        {
            key: "copyMode",
            label: "Copy Mode",
            value: copyMode,
            options: ["worktree", "full"],
            descriptions: {
                worktree: "Fast: git worktree + copy untracked files",
                full: "Full copy: copies entire repo directory",
            },
        },
        {
            key: "skipBuildArtifacts",
            label: "Skip Build Artifacts",
            value: skipArtifacts ? "yes" : "no",
            options: ["no", "yes"],
            descriptions: {
                yes: "Skip node_modules, dist, .next, etc (run install instead)",
                no: "Copy everything including build artifacts",
            },
        },
        {
            key: "autoInstall",
            label: "Auto Install",
            value: install ? "yes" : "no",
            options: ["yes", "no"],
            descriptions: {
                yes: "Run package manager install after creating lane",
                no: "Skip automatic dependency installation",
            },
        },
    ];
    useInput((input, key) => {
        if (key.upArrow || input === "k") {
            setSelectedIndex((i) => Math.max(0, i - 1));
        }
        else if (key.downArrow || input === "j") {
            setSelectedIndex((i) => Math.min(options.length - 1, i + 1));
        }
        else if (key.leftArrow || input === "h" || key.rightArrow || input === "l") {
            const opt = options[selectedIndex];
            const currentIdx = opt.options.indexOf(opt.value);
            const direction = (key.leftArrow || input === "h") ? -1 : 1;
            const newIdx = Math.max(0, Math.min(opt.options.length - 1, currentIdx + direction));
            if (opt.key === "copyMode") {
                setCopyMode(opt.options[newIdx]);
            }
            else if (opt.key === "skipBuildArtifacts") {
                setSkipArtifacts(opt.options[newIdx] === "yes");
            }
            else if (opt.key === "autoInstall") {
                setInstall(opt.options[newIdx] === "yes");
            }
        }
        else if (key.return || input === "s") {
            onSave({ copyMode, autoInstall: install, skipBuildArtifacts: skipArtifacts });
            exit();
        }
        else if (input === "q" || key.escape) {
            exit();
        }
    });
    return (_jsxs(Box, { flexDirection: "column", padding: 1, children: [_jsx(Box, { marginBottom: 1, children: _jsx(Text, { bold: true, color: "blue", children: "Lane Settings" }) }), options.map((opt, idx) => {
                const isSelected = idx === selectedIndex;
                const desc = opt.descriptions[opt.value];
                return (_jsxs(Box, { flexDirection: "column", marginBottom: 1, children: [_jsxs(Box, { children: [_jsx(Text, { color: isSelected ? "cyan" : "gray", children: isSelected ? "❯ " : "  " }), _jsxs(Text, { bold: true, color: isSelected ? "white" : "gray", children: [opt.label, ": "] }), _jsx(Text, { color: "yellow", children: opt.value }), _jsx(Text, { color: "gray", children: " (\u2190/\u2192 to change)" })] }), _jsx(Box, { marginLeft: 4, children: _jsx(Text, { color: "gray", children: desc }) })] }, opt.key));
            }), _jsx(Box, { marginTop: 1, flexDirection: "column", children: _jsx(Text, { color: "gray", children: "\u2191\u2193 navigate \u2022 \u2190\u2192 change \u2022 Enter save \u2022 q cancel" }) })] }));
}
