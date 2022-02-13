export type IOAccessoryConfig = {
    name: string;
    activeLow: boolean;
}

export type SwitchConfig = IOAccessoryConfig & {
    type: "switch";
    input: number;
    output: number;
};

export type WindowCoveringConfig = IOAccessoryConfig & {
    type: "window-covering";
    inputUp: number;
    inputDown: number;
    outputUp: number;
    outputDown: number;
    durationUp: number;
    durationDown: number;
    durationOffset: number;
};