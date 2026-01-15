interface Lane {
    name: string;
    path: string;
    branch: string;
    isMain: boolean;
    isCurrent: boolean;
}
interface LaneListProps {
    lanes: Lane[];
    onSelect: (lane: Lane) => void;
}
export declare function LaneList({ lanes, onSelect }: LaneListProps): import("react/jsx-runtime").JSX.Element;
export {};
