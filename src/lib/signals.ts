
export class Signal {
    type: string;

    constructor(type: string) {
        this.type = type;
    }
}

export const StopPropagation = new Signal('StopPropagation');
export const IgnoreSIGINT = new Signal('IgnoreSIGINT');

