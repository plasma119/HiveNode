import { inspect } from 'util';

import DataIO from './dataIO.js';
import HiveComponent from '../lib/hiveComponent.js';
import { DataSignaturesToString } from './hiveNet.js';
import { CircularBuffer } from '../../lib/circularBuffer.js';

type DataIOBufferOptions = {
    maxSize: number;
    deserialize: boolean;
    deserializeColor: boolean;
    deserializeDepth: number;
    includeSignatures: boolean;
};

const DEFAULTSCREENOPTIONS: DataIOBufferOptions = {
    maxSize: 1000,
    deserialize: false,
    deserializeColor: false,
    deserializeDepth: 4,
    includeSignatures: false,
};

export default class DataIOBuffer extends HiveComponent {
    stdIO: DataIO = new DataIO(this, 'screen');
    options: DataIOBufferOptions;

    buffer: CircularBuffer<any>;

    constructor(options?: Partial<DataIOBufferOptions>) {
        super('DataIOBuffer');
        this.options = Object.assign({}, DEFAULTSCREENOPTIONS, options);
        this.buffer = new CircularBuffer(this.options.maxSize);
        this.stdIO.on(
            'input',
            (data, signatures) => {
                if (this.options.deserialize) data = inspect(data, false, this.options.deserializeDepth, this.options.deserializeColor);
                if (this.options.includeSignatures) {
                    this.buffer.push({
                        data: data,
                        signatures: this.options.deserialize ? DataSignaturesToString(signatures) : signatures,
                    });
                } else {
                    this.buffer.push(data);
                }
            },
            'DataIOBuffer input'
        );
    }

    slice(start?: number, end?: number) {
        return this.buffer.slice(start, end);
    }

    clear() {
        this.buffer.clear();
    }

    size() {
        return this.buffer.size();
    }

    resize(size: number) {
        this.options.maxSize = size;
        this.buffer.resize(size);
    }
}
