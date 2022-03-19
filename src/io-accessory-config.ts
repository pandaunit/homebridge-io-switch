export type IOAccessoryConfig = {
    name: string;
    activeLow: boolean;
    inputInterval: number;
}

export type SwitchConfig = IOAccessoryConfig & {
    type: "switch";
    input: number;
    output: number;
};

export type StatelessSwitchConfig = IOAccessoryConfig & {
    type: "stateless-switch";
    input: number;
    output: number;
    duration: number;
};

export type LockConfig = IOAccessoryConfig & {
    type: "lock";
    input: number;
    output: number;
    unlockingDuration: number;
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