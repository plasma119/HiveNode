import HiveComponent from '../lib/hiveComponent.js';
import { Signal, StopPropagation } from '../lib/signals.js';
import { DataSignature, DataSignaturesToString, HiveNetPacket } from './hiveNet.js';

/*
    OSI model layer 1 - physical layer
*/
export type DataLink<DataType = any> = (data: DataType, signatures: DataSignature[]) => void;

let debugMode = false;

export type DataIOEvent<DataType = any> = {
    input: DataLink<DataType>;
    output: DataLink<DataType>;
    connect: (io: DataIO<DataType>) => void;
    disconnect: (io: DataIO<DataType>) => void;
    destroy: () => void;
};

export default class DataIO<DataType = any> extends HiveComponent<DataIOEvent<DataType>> {
    owner: HiveComponent;

    connectTable: Map<DataIO<DataType>, boolean> = new Map();
    passThroughTable: Map<DataIO<DataType>, DataIO> = new Map(); // <targetIO, baseIO>
    destroyed: boolean = false;
    inputBind: DataLink<DataType>;
    outputBind: DataLink<DataType>;

    constructor(owner: HiveComponent, name: string) {
        super(name);
        this.owner = owner;
        this.name = name;
        this.inputBind = this.input.bind(this);
        this.outputBind = this.output.bind(this);
    }

    // listen to dataIO.on('input') to get data
    input(data: DataType, signatures: DataSignature[] = []) {
        if (!this.destroyed) {
            if (debugMode) {
                console.log(data);
                console.log(DataSignaturesToString(signatures));
            }
            if (data instanceof HiveNetPacket && data.flags.log) {
                console.log(data);
                console.log(DataSignaturesToString(signatures));
            }
            this.emit('input', data, this._sign(signatures.slice(), 'input'));
        }
    }

    // write to dataIO.output() to send data
    output(data: DataType, signatures: DataSignature[] = []) {
        if (!this.destroyed) {
            if (debugMode) {
                console.log(data);
                console.log(DataSignaturesToString(signatures));
            }
            if (data instanceof HiveNetPacket && data.flags.log) {
                console.log(data);
                console.log(DataSignaturesToString(signatures));
            }
            this.emit('output', data, this._sign(signatures.slice(), 'output'));
        }
    }

    // between objects
    connect(target: DataIO<DataType>) {
        if (this.connectTable.has(target)) return;
        this.connectTable.set(target, true);
        target.connectTable.set(this, true);
        target.on('output', this.inputBind, 'dataIO');
        this.on('output', target.inputBind, 'dataIO');
        target.emit('connect', this);
        this.emit('connect', target);
    }

    // between objects
    disconnect(target: DataIO<DataType>) {
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
    passThrough(target: DataIO<DataType>) {
        if (this.passThroughTable.has(target)) return;
        this.passThroughTable.set(target, this);
        target.passThroughTable.set(this, this);
        target.on('output', this.outputBind, 'dataIO');
        this.on('input', target.inputBind, 'dataIO');
    }

    // inside object
    // !! directional
    unpassThrough(target: DataIO<DataType>) {
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

export class DataTransformer<DataType extends any, TransformedDataType = any> extends HiveComponent {
    stdIO: DataIO<TransformedDataType>;
    targetIO: DataIO<DataType>;
    inputTransform?: (data: TransformedDataType, _signatures: DataSignature[]) => DataType | Signal;
    outputTransform?: (data: DataType, _signatures: DataSignature[]) => TransformedDataType | Signal;

    constructor(targetIO: DataIO<DataType>) {
        super('DataTransformer');
        this.stdIO = new DataIO<TransformedDataType>(targetIO.owner, 'DT');
        this.targetIO = targetIO;

        this.stdIO.on(
            'input',
            (data: TransformedDataType, signatures: DataSignature[]) => {
                if (!this.inputTransform) return;
                this._sign(signatures);
                const result = this.inputTransform(data, signatures);
                if (result instanceof Signal) {
                    if (result === StopPropagation) return;
                } else {
                    this.targetIO.input(result, signatures);
                }
            },
            'DT',
        );
        this.targetIO.on(
            'output',
            (data: DataType, signatures: DataSignature[]) => {
                if (!this.outputTransform) return;
                this._sign(signatures);
                const result = this.outputTransform(data, signatures);
                if (result instanceof Signal) {
                    if (result === StopPropagation) return;
                } else {
                this.stdIO.output(result, signatures);
                }
            },
            'DT',
        );

        this.targetIO.on('destroy', () => this.stdIO.destroy());
    }

    setInputTransform(inputTransform: (data: TransformedDataType, _signatures: DataSignature[]) => DataType) {
        this.inputTransform = inputTransform;
    }

    setOutputTransform(outputTransform: (data: DataType, _signatures: DataSignature[]) => TransformedDataType) {
        this.outputTransform = outputTransform;
    }

    /**
     * WARNING: data type maybe incompatible
     */
    setPassThroughTransform() {
        this.inputTransform = (data) => data as any as DataType;
        this.outputTransform = (data) => data as any as TransformedDataType;
    }

    clearTransform() {
        this.inputTransform = undefined;
        this.outputTransform = undefined;
    }

    private _sign(signatures: DataSignature[]) {
        const signature = this.stdIO.getSignature();
        signature.event = 'DT';
        signatures.push(signature);
        return signatures;
    }
}
