import { CopyMode } from "../config.js";
interface SettingsProps {
    currentMode: CopyMode;
    autoInstall: boolean;
    skipBuildArtifacts: boolean;
    onSave: (settings: {
        copyMode: CopyMode;
        autoInstall: boolean;
        skipBuildArtifacts: boolean;
    }) => void;
}
export declare function Settings({ currentMode, autoInstall, skipBuildArtifacts, onSave }: SettingsProps): import("react/jsx-runtime").JSX.Element;
export {};
