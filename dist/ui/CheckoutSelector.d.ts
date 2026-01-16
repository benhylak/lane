interface Lane {
    name: string;
    path: string;
    branch: string;
    isMain: boolean;
    isCurrent: boolean;
}
type CheckoutAction = {
    type: "create-new";
    branchName: string;
} | {
    type: "checkout-in-lane";
    lane: Lane;
    branchName: string;
} | {
    type: "cancel";
};
interface CheckoutSelectorProps {
    branchName: string;
    branchExists: boolean;
    lanes: Lane[];
    onSelect: (action: CheckoutAction) => void;
}
export declare function CheckoutSelector({ branchName, branchExists, lanes, onSelect, }: CheckoutSelectorProps): import("react/jsx-runtime").JSX.Element;
export {};
