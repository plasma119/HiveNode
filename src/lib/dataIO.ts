
import { TypedEmitter } from 'tiny-typed-emitter';

import { StopPropagation } from './signals.js';

export type DataSignature = {
    by: object,
    label: string,
    timestamp: number,
    UID: number,
    event: string
}

export type DataLink = (data: any, signatures: DataSignature[]) => void;

export interface DataIOEvent {
    'input': DataLink;
    'output': DataLink;
}

let id = 1;

export default class DataIO extends TypedEmitter<DataIOEvent> {
    private _signature: DataSignature;
    connectList: DataIO[] = [];
    passThroughList: DataIO[] = [];

    constructor(owner: object, label: string) {
        super();
        this._signature = {
            by: owner,
            label: label,
            timestamp: 0,
            UID: id++,
            event: ''
        };
    }

    // should be called by sender's dataIO only
    // listen to dataIO.on('input') to get data
    input(data: any, signatures: DataSignature[] = []) {
        this.emit('input', data, this._sign(signatures.slice(), 'input'));
    }

    // should be called by owner/owner's dataIO only
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
    }

    getSignature() {
        return Object.create(this._signature);
    }

    private _sign(signatures: DataSignature[], event: string) {
        const signature = Object.create(this._signature);
        signature.timestamp = Date.now();
        signature.event = event;
        signatures.push(signature);
        return signatures;
    }
}

export class DataTransformer {
    stdIO: DataIO;
    targetIO: DataIO;

    constructor(targetIO: DataIO) {
        this.stdIO = new DataIO(targetIO, 'DataTransformer');
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