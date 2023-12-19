import { inspect } from 'util';

import DataIO from './dataIO.js';
import HiveComponent from '../lib/component.js';
import { Options } from '../lib/lib.js';
import { DataSignaturesToString } from './hiveNet.js';

type DataIOScreenOptions = {
    maxSize: number;
    deserialize: boolean;
    includeSignatures: boolean;
};

const DEFAULTSCREENOPTIONS: DataIOScreenOptions = {
    maxSize: 1000,
    deserialize: true,
    includeSignatures: false,
};

export default class DataIOScreen extends HiveComponent {
    stdIO: DataIO = new DataIO(this, 'screen');
    options: DataIOScreenOptions;

    _records: any[] = [];
    _pointer: number = 0;

    constructor(options?: Options<DataIOScreenOptions>) {
        super('screen');
        this.options = Object.assign({}, DEFAULTSCREENOPTIONS, options);
        this.stdIO.on(
            'input',
            (data, signatures) => {
                if (this.options.deserialize) data = inspect(data, false, 2, true);
                if (this.options.includeSignatures) {
                    this._addRecord({
                        data: data,
                        signatures: this.options.deserialize ? DataSignaturesToString(signatures) : signatures,
                    });
                } else {
                    this._addRecord(data);
                }
            },
            'screen input'
        );
    }

    _addRecord(record: any) {
        this._records[this._pointer++] = record;
        if (this._pointer >= this.options.maxSize) this._pointer = 0;
    }

    get(start?: number, end?: number) {
        if (this._records.length < this.options.maxSize) {
            return this._records.slice(start, end);
        } else {
            let segment1 = this._records.slice(this._pointer);
            let segment2 = this._records.slice(0, this._pointer);
            let result = segment1.concat(segment2);
            return result.slice(start, end);
        }
    }

    clear() {
        this._records = [];
        this._pointer = 0;
    }

    resize(size: number) {
        let currentRecord = this.get();
        this.options.maxSize = size;
        if (size < currentRecord.length) {
            this._records = currentRecord.slice(currentRecord.length - size);
            this._pointer = 0;
        } else {
            this._records = currentRecord;
            this._pointer = currentRecord.length;
        }
        if (this._pointer >= this.options.maxSize) this._pointer = 0;
    }
}
