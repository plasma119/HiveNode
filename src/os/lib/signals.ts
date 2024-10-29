
export class Signal {
    type: string;

    constructor(type: string) {
        this.type = type;
    }
}

// for DataTranformer
export const StopPropagation = new Signal('StopPropagation');

// for ExitHelper
export const IgnoreSIGINT = new Signal('IgnoreSIGINT');

// for callback control
export const StopSignal = new Signal('StopSignal');
