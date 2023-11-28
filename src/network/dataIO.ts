import HiveComponent from '../lib/component.js';
import { StopPropagation } from '../lib/signals.js';
import { DataSignature, DataSignaturesToString } from './hiveNet.js';

/*
    OSI model layer 1 - physical layer
*/
export type DataLink = (data: any, signatures: DataSignature[]) => void;

let debugMode = false;

export type DataIOEvent = {
    input: DataLink;
    output: DataLink;
    connect: (io: DataIO) => void;
    disconnect: (io: DataIO) => void;
    destroy: () => void;
};

export default class DataIO extends HiveComponent<DataIOEvent> {
    owner: HiveComponent;

    connectTable: Map<DataIO, boolean> = new Map();
    passThroughTable: Map<DataIO, DataIO> = new Map(); // <targetIO, baseIO>
    destroyed: boolean = false;
    inputBind: DataLink;
    outputBind: DataLink;

    constructor(owner: HiveComponent, name: string) {
        super(name);
        this.owner = owner;
        this.name = name;
        this.inputBind = this.input.bind(this);
        this.outputBind = this.output.bind(this);
    }

    // listen to dataIO.on('input') to get data
    input(data: any, signatures: DataSignature[] = []) {
        if (!this.destroyed) {
            if (debugMode) {
                console.log(data);
                console.log(DataSignaturesToString(signatures));
            }
            this.emit('input', data, this._sign(signatures.slice(), 'input'));
        }
    }

    // write to dataIO.output() to send data
    output(data: any, signatures: DataSignature[] = []) {
        if (!this.destroyed) {
            if (debugMode) {
                console.log(data);
                console.log(DataSignaturesToString(signatures));
            }
            this.emit('output', data, this._sign(signatures.slice(), 'output'));
        }
    }

    // between objects
    connect(target: DataIO) {
        if (this.connectTable.has(target)) return;
        this.connectTable.set(target, true);
        target.connectTable.set(this, true);
        target.on('output', this.inputBind, 'dataIO');
        this.on('output', target.inputBind, 'dataIO');
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
        this.passThroughTable.set(target, this);
        target.passThroughTable.set(this, this);
        target.on('output', this.outputBind, 'dataIO');
        this.on('input', target.inputBind, 'dataIO');
    }

    // inside object
    // !! directional
    unpassThrough(target: DataIO) {
        let base = this.passThroughTable.get(target);
        if (!base) return;
        this.passThroughTable.delete(target);
        target.passThroughTable.delete(this);
        if (base != this) {
            this.off('output', target.outputBind);
            target.off('input', this.inputBind);
            return;
        }
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
        return {
            by: this.owner,
            name: this.name,
            timestamp: Date.now(),
            UUID: this.UUID,
            event: '',
        } as DataSignature;
    }

    private _sign(signatures: DataSignature[], event: 'input' | 'output') {
        const signature = this.getSignature();
        signature.event = event;
        signatures.push(signature);
        return signatures;
    }

    static debugMode() {
        debugMode = !debugMode;
        console.log(`DataIO debug mode: ${debugMode}`);
    }
}

export class DataTransformer extends HiveComponent {
    stdIO: DataIO;
    targetIO: DataIO;
    inputTransform: (data: any, _signatures: DataSignature[]) => any;
    outputTransform: (data: any, _signatures: DataSignature[]) => any;

    constructor(targetIO: DataIO) {
        super('DataTransformer');
        this.stdIO = new DataIO(targetIO.owner, 'DT');
        this.targetIO = targetIO;
        this.inputTransform = (data) => data;
        this.outputTransform = (data) => data;

        this.stdIO.on(
            'input',
            (data: any, signatures: DataSignature[]) => {
                this._sign(signatures);
                const result = this.inputTransform(data, signatures);
                if (result === StopPropagation) return;
                this.targetIO.input(result, signatures);
            },
            'DT'
        );
        this.targetIO.on(
            'output',
            (data: any, signatures: DataSignature[]) => {
                this._sign(signatures);
                const result = this.outputTransform(data, signatures);
                if (result === StopPropagation) return;
                this.stdIO.output(result, signatures);
            },
            'DT'
        );
        this.targetIO.on('destroy', () => this.stdIO.destroy());
    }

    setInputTransform(inputTransform: (data: any, _signatures: DataSignature[]) => any) {
        this.inputTransform = inputTransform;
    }

    setOutputTransform(outputTransform: (data: any, _signatures: DataSignature[]) => any) {
        this.outputTransform = outputTransform;
    }

    private _sign(signatures: DataSignature[]) {
        const signature = this.stdIO.getSignature();
        signature.event = 'DT';
        signatures.push(signature);
        return signatures;
    }
}
