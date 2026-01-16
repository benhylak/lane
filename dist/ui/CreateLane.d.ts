type Phase = "register" | "worktree" | "find" | "copy" | "install" | "done" | "error";
interface CreateLaneUIProps {
    laneName: string;
    onComplete: () => void;
    phase: Phase;
    progress?: {
        current: number;
        total: number;
        currentItem?: string;
    };
    itemsToCopy?: string[];
    skippedCount?: number;
    error?: string;
    branchName?: string;
    installingPkg?: string;
}
export declare function CreateLaneUI({ laneName, phase, progress, itemsToCopy, skippedCount, error, branchName, installingPkg, onComplete, }: CreateLaneUIProps): import("react/jsx-runtime").JSX.Element;
export {};
