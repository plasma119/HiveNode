import { TypedEmitter } from 'tiny-typed-emitter';

import HiveComponent from '../lib/component.js';
import { applyMixins } from '../lib/lib.js';
import { StopPropagation } from '../lib/signals.js';
import { DataSignature } from './hiveNet.js';

/*
    OSI model layer 1 - physical layer
*/
export type DataLink = (data: any, signatures: DataSignature[]) => void;
export interface DataIOEvent {
    input: DataLink;
    output: DataLink;
    connect: any; // DataIO
    disconnect: any; // DataIO
    destroy: any;
}

interface DataIO extends TypedEmitter<DataIOEvent> {}
class DataIO extends HiveComponent {
    owner: any;
    private _signature: DataSignature;

    connectTable: Map<DataIO, boolean> = new Map();
    passThroughTable: Map<DataIO, boolean> = new Map();
    destroyed: boolean = false;
    inputBind: DataLink;
    outputBind: DataLink;

    constructor(owner: object, name: string) {
        super(name);
        this.owner = owner;
        this.name = name;
        this._signature = {
            by: owner,
            name: name,
            timestamp: 0,
            UUID: this.UUID,
            event: '',
        };
        this.inputBind = this.input.bind(this);
        this.outputBind = this.output.bind(this);
    }

    // listen to dataIO.on('input') to get data
    input(data: any, signatures: DataSignature[] = []) {
        if (!this.destroyed) this.emit('input', data, this._sign(signatures.slice(), 'input'));
    }

    // write to dataIO.output() to send data
    output(data: any, signatures: DataSignature[] = []) {
        if (!this.destroyed) this.emit('output', data, this._sign(signatures.slice(), 'output'));
    }

    // between objects
    connect(target: DataIO) {
        if (this.connectTable.has(target)) return;
        this.connectTable.set(target, true);
        target.connectTable.set(this, true);
        target.on('output', this.inputBind);
        this.on('output', target.inputBind);
        target.emit('connect', this);
        this.emit('connect', target);
    }

    // between objects
    disconnect(target: DataIO) {
        if (!this.connectTable.has(target)) return;
        this.connectTable.delete(target);
        target.connectTable.delete(this);
        target.off('output', this.inputBind);
        this.off('output', target.inputBind);
        target.emit('disconnect', this);
        this.emit('disconnect', target);
    }

    // inside object
    // !! directional: this -> I -> target -> O -> this
    passThrough(target: DataIO) {
        if (this.passThroughTable.has(target)) return;
        this.passThroughTable.set(target, true);
        target.passThroughTable.set(this, true);
        target.on('output', this.outputBind);
        this.on('input', target.inputBind);
    }

    // inside object
    // !! directional
    unpassThrough(target: DataIO) {
        if (!this.passThroughTable.has(target)) return;
        this.passThroughTable.delete(target);
        target.passThroughTable.delete(this);
        target.off('output', this.outputBind);
        this.off('input', target.inputBind);
    }

    clear() {
        this.connectTable.forEach((_, target) => this.disconnect(target));
        this.passThroughTable.forEach((_, target) => this.unpassThrough(target));
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.clear();
        this.emit('destroy');
    }

    getSignature() {
        return Object.create(this._signature);
    }

    private _sign(signatures: DataSignature[], event: string) {
        const signature = Object.create(this._signature);
        signature.timestamp = Date.now();
        signature.event = event;
        signature.label = this.name;
        signatures.push(signature);
        return signatures;
    }
}
applyMixins(DataIO, [TypedEmitter]);
export default DataIO;

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
