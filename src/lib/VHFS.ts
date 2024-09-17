import { DBWrapper } from '../os/processes/db.js';
import BasicEventEmitter from './basicEventEmitter';
import { uuidv7 } from './lib.js';

type fileRecord = {
    id: string;
    name: string;
    path: string;
    fileStat?: {
        created: number;
        modified: number;
        hash?: string;
    };
    metadata: {};
    bundleID: string[];
};

// type fileBundleType = 'file';
// e.g. new VHFS<fileBundleType>('foo')
type fileBundle<T> = {
    id: string;
    type: T;
    name: string;
    fileIDs: string[];
    lastUpdate: number;
    metadata: {};
};

type VHFSExport<T> = {
    bundles: fileBundle<T>[];
    files: fileRecord[];
};

type VHFSEvent = {
    error: (e: Error) => void;
};

// TODO: delete record/bundle
// throws error directly if no error event listener exist
export default class VHFS<T> extends BasicEventEmitter<VHFSEvent> {
    fileRecords: Map<string, fileRecord> = new Map();
    fileBundles: Map<string, fileBundle<T>> = new Map();

    name: string;
    db?: DBWrapper;

    constructor(name: string, database?: DBWrapper) {
        super();
        this.name = name;
        if (database) {
            this.db = database;
            this.initDB();
        }
    }

    initDB() {
        // TODO: prepare tables/other info
    }

    bundleAddRecord(fileBundle: fileBundle<T>, fileRecord: fileRecord) {
        fileRecord.bundleID.push(fileBundle.id);
        this.putRecord(fileRecord);
        fileBundle.fileIDs.push(fileRecord.id);
        this.putBundle(fileBundle);
    }

    bundleAddRecords(fileBundle: fileBundle<T>, fileRecords: fileRecord[]) {
        fileRecords.forEach((r) => {
            r.bundleID.push(fileBundle.id);
            this.putRecord(r);
        });
        fileBundle.fileIDs.push(...fileRecords.map((r) => r.id));
        this.putBundle(fileBundle);
    }

    newRecord(fileName: string, path: string): fileRecord {
        let record: fileRecord = {
            id: uuidv7(),
            name: fileName,
            path,
            metadata: {},
            bundleID: [],
        };
        return record;
    }

    newBundle(type: T, name: string): fileBundle<T> {
        let bundle: fileBundle<T> = {
            id: uuidv7(),
            type,
            name,
            fileIDs: [],
            lastUpdate: Date.now(),
            metadata: {},
        };
        return bundle;
    }

    putRecord(record: fileRecord) {
        this.fileRecords.set(record.id, record);
        if (this.db) {
            this.db.put(this.getRecordTableName(), record.id, JSON.stringify(record));
        }
    }

    putBundle(bundle: fileBundle<T>) {
        this.fileBundles.set(bundle.id, bundle);
        if (this.db) {
            this.db.put(this.getBundleTableName(), bundle.id, JSON.stringify(bundle));
        }
    }

    async getRecord(recordID: string) {
        let record = this.fileRecords.get(recordID);
        if (!record && this.db) {
            try {
                let recordDB = await this.db.get(this.getRecordTableName(), recordID);
                if (recordDB) record = JSON.parse(recordDB) as fileRecord;
            } catch (error) {
                this._emitError(error as Error);
            }
        }
        return record;
    }

    async getBundle(bundleID: string) {
        let bundle = this.fileBundles.get(bundleID);
        if (!bundle && this.db) {
            try {
                let bundleDB = await this.db.get(this.getBundleTableName(), bundleID);
                if (bundleDB) bundle = JSON.parse(bundleDB) as fileBundle<T>;
            } catch (error) {
                this._emitError(error as Error);
            }
        }
        return bundle;
    }

    async getAllRecordFromDB() {
        if (!this.db) return;
        const records = await this.db.getTable(this.getRecordTableName());
        if (records) {
            records.forEach((r) => {
                try {
                    let record = JSON.parse(r) as fileRecord;
                    this.fileRecords.set(record.id, record);
                } catch (error) {
                    this._emitError(error as Error);
                }
            });
        }
        const bundles = await this.db.getTable(this.getBundleTableName());
        if (bundles) {
            bundles.forEach((b) => {
                try {
                    let bundle = JSON.parse(b) as fileBundle<T>;
                    this.fileBundles.set(bundle.id, bundle);
                } catch (error) {
                    this._emitError(error as Error);
                }
            });
        }
    }

    getRecordTableName() {
        return `VHFS[${this.name}]-record`;
    }

    getBundleTableName() {
        return `VHFS[${this.name}]-bundle`;
    }

    exportJSON(): VHFSExport<T> {
        // TODO: optimize: remove JSON conversions for db
        this.getAllRecordFromDB();
        return {
            bundles: Array.from(this.fileBundles.values()),
            files: Array.from(this.fileRecords.values()),
        };
    }

    importJSON(json: string | VHFSExport<T>) {
        if (typeof json === 'string') json = JSON.parse(json) as VHFSExport<T>;
        json.bundles.forEach((bundle) => this.putBundle(bundle));
        json.files.forEach((file) => this.putRecord(file));
    }

    _emitError(error: Error) {
        if (this.getListenerCount('error') === 0) throw error;
        this.emit('error', error);
    }
}
