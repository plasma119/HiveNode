import { randomUUID } from 'crypto';

import { TypedEmitter } from 'tiny-typed-emitter';

import { StopPropagation } from './signals.js';

export type DataSignature = {
    by: object;
    label: string;
    timestamp: number;
    UUID: string;
    event: string;
};

export type DataLink = (data: any, signatures: DataSignature[]) => void;
export interface DataIOEvent {
    input: DataLink;
    output: DataLink;
    disconnect: any; // DataIO
}

export default class DataIO extends TypedEmitter<DataIOEvent> {
    UUID: string = randomUUID();
    owner: any;
    label: string;
    private _signature: DataSignature;
    connectList: DataIO[] = [];
    passThroughList: DataIO[] = [];
    destroyed: boolean = false;

    constructor(owner: object, label: string) {
        super();
        this.owner = owner;
        this.label = label;
        this._signature = {
            by: owner,
            label: label,
            timestamp: 0,
            UUID: this.UUID,
            event: '',
        };
    }

    // listen to dataIO.on('input') to get data
    input(data: any, signatures: DataSignature[] = []) {
        this.emit('input', data, this._sign(signatures.slice(), 'input'));
    }

    // write to dataIO.output() to send data
    output(data: any, signatures: DataSignature[] = []) {
        this.emit('output', data, this._sign(signatures.slice(), 'output'));
    }

    // between objects
    connect(target: DataIO) {
        this.connectList.push(target);
        target.connectList.push(this);
        target.on('output', this.input.bind(this));
        this.on('output', target.input.bind(target));
    }

    // between objects
    disconnect(target: DataIO) {
        let i = this.connectList.indexOf(target);
        if (i === -1) return;
        this.connectList.splice(i, 1);
        let j = target.connectList.indexOf(this);
        if (j > -1) target.connectList.splice(j, 1);
        target.off('output', this.input.bind(this));
        this.off('output', target.input.bind(target));
        target.emit('disconnect', this);
        this.emit('disconnect', target);
    }

    // inside object
    // !! directional: this -> I -> target -> O -> this
    passThrough(target: DataIO) {
        this.passThroughList.push(target);
        target.passThroughList.push(this);
        target.on('output', this.output.bind(this));
        this.on('input', target.input.bind(target));
    }

    // inside object
    // !! directional
    unpassThrough(target: DataIO) {
        let i = this.passThroughList.indexOf(target);
        if (i === -1) return;
        this.passThroughList.splice(i, 1);
        let j = target.passThroughList.indexOf(this);
        if (j > -1) target.passThroughList.splice(j, 1);
        target.off('output', this.output.bind(this));
        this.off('input', target.input.bind(target));
        target.emit('disconnect', this);
        this.emit('disconnect', target);
    }

    destroy() {
        this.destroyed = true;
        this.connectList.forEach((target) => this.disconnect(target));
        this.passThroughList.forEach((target) => this.unpassThrough(target));
    }

    getSignature() {
        return Object.create(this._signature);
    }

    private _sign(signatures: DataSignature[], event: string) {
        const signature = Object.create(this._signature);
        signature.timestamp = Date.now();
        signature.event = event;
        signature.label = this.label;
        signatures.push(signature);
        return signatures;
    }
}

export class DataTransformer {
    stdIO: DataIO;
    targetIO: DataIO;

    constructor(targetIO: DataIO) {
        this.stdIO = new DataIO(targetIO.owner, 'DataTransformer-stdIO');
        this.targetIO = targetIO;
        this.stdIO.on('input', (data: any, signatures: DataSignature[]) => {
            const result = this.inputTransform(data, signatures);
            if (result === StopPropagation) return;
            this.targetIO.input(result, signatures);
        });
        this.targetIO.on('output', (data: any, signatures: DataSignature[]) => {
            const result = this.outputTransform(data, signatures);
            if (result === StopPropagation) return;
            this.stdIO.output(result, signatures);
        });
    }

    inputTransform(data: any, _signatures: DataSignature[]): any {
        return data;
    }

    outputTransform(data: any, _signatures: DataSignature[]): any {
        return data;
    }
}

export function DataSignaturesToString(signatures: DataSignature[]) {
    // @ts-ignore
    return signatures.map((s) => `${s.label}[${s.by.name}]:${s.event}`).join('->');
}
