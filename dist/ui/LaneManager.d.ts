interface Lane {
    name: string;
    path: string;
    branch: string;
    isMain: boolean;
    isCurrent: boolean;
}
type Action = "switch" | "delete" | "sync" | "cancel";
interface LaneManagerProps {
    lanes: Lane[];
    onAction: (action: Action, lane: Lane) => void;
}
export declare function LaneManager({ lanes, onAction }: LaneManagerProps): import("react/jsx-runtime").JSX.Element;
export {};
