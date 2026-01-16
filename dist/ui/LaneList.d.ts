interface Lane {
    name: string;
    path: string;
    branch: string;
    isMain: boolean;
    isCurrent: boolean;
}
type Action = "switch" | "delete" | "none";
interface LaneListProps {
    lanes: Lane[];
    onSelect: (lane: Lane, action: Action) => void;
    onBulkDelete?: (lanes: Lane[]) => void;
}
export declare function LaneList({ lanes, onSelect, onBulkDelete }: LaneListProps): import("react/jsx-runtime").JSX.Element;
export {};
