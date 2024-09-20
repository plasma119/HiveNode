import { DBWrapper } from '../os/processes/db.js';
import BasicEventEmitter from './basicEventEmitter.js';
import { uuidv7 } from './lib.js';

type fileRecord = {
    id: string;
    name: string;
    path: string;
    server: string;
    fileStat?: {
        created: number;
        modified: number;
        size: number;
    };
    metadata: {
        hash?: string;
    };
    bundleID: string[];
};

// type bundleRecordType = 'file';
// e.g. new VHFS<bundleRecordType>('foo')
type bundleRecord<T> = {
    id: string;
    type: T;
    name: string;
    fileIDs: string[];
    lastUpdate: number;
    metadata: {};
};

type VHFSExport<T> = {
    bundles: bundleRecord<T>[];
    files: fileRecord[];
};

type VHFSEvent = {
    error: (e: Error) => void;
};

// TODO: delete record/bundle
// TODO: alias, file name map table?
// TODO: logging
// throws error directly if no error event listener exist
// actual file operations should be done by other modules
export default class VHFS<T> extends BasicEventEmitter<VHFSEvent> {
    files: Map<string, fileRecord> = new Map();
    bundles: Map<string, bundleRecord<T>> = new Map();

    name: string;
    db?: DBWrapper;

    fileTableName: string;
    bundleTableName: string;

    constructor(name: string) {
        super();
        this.name = name;
        this.fileTableName = `VHFS[${this.name}]-file`;
        this.bundleTableName = `VHFS[${this.name}]-bundle`;
    }

    useDatabase(database: DBWrapper) {
        if (!database.avaliable) {
            this._emitError(new Error('Database Not Avaliable!'));
            return;
        }
        this.db = database;
        this._initDB();
    }

    _initDB() {
        // TODO: prepare tables/other info
    }

    //TODO: delete record/bundle, remove record form bundle
    async bundleAddFile(bundle: bundleRecord<T>, file: fileRecord) {
        file.bundleID.push(bundle.id);
        await this.putFile(file);
        bundle.fileIDs.push(file.id);
        await this.putBundle(bundle);
    }

    async bundleAddFiles(bundle: bundleRecord<T>, file: fileRecord[]) {
        for (let record of file) {
            record.bundleID.push(bundle.id);
            await this.putFile(record);
        }
        bundle.fileIDs.push(...file.map((r) => r.id));
        await this.putBundle(bundle);
    }

    newFile(fileName: string, path: string, server: string): fileRecord {
        let record: fileRecord = {
            id: uuidv7(),
            name: fileName,
            path,
            server,
            metadata: {},
            bundleID: [],
        };
        return record;
    }

    newBundle(type: T, name: string): bundleRecord<T> {
        let bundle: bundleRecord<T> = {
            id: uuidv7(),
            type,
            name,
            fileIDs: [],
            lastUpdate: Date.now(),
            metadata: {},
        };
        return bundle;
    }

    async putFile(file: fileRecord) {
        this.files.set(file.id, file);
        if (this.db) {
            return this.db.put(this.fileTableName, file.id, JSON.stringify(file)).catch(this._emitError);
        }
    }

    async putBundle(bundle: bundleRecord<T>) {
        this.bundles.set(bundle.id, bundle);
        if (this.db) {
            return this.db.put(this.bundleTableName, bundle.id, JSON.stringify(bundle)).catch(this._emitError);
        }
    }

    async getFile(fileID: string) {
        let file = this.files.get(fileID);
        if (!file && this.db) {
            try {
                let fileDB = await this.db.get(this.fileTableName, fileID).catch(this._emitError);
                if (fileDB) {
                    file = JSON.parse(fileDB) as fileRecord;
                    this.files.set(fileID, file);
                }
            } catch (error) {
                this._emitError(error);
            }
        }
        return file;
    }

    async getBundle(bundleID: string) {
        let bundle = this.bundles.get(bundleID);
        if (!bundle && this.db) {
            try {
                let bundleDB = await this.db.get(this.bundleTableName, bundleID).catch(this._emitError);
                if (bundleDB) {
                    bundle = JSON.parse(bundleDB) as bundleRecord<T>;
                    this.bundles.set(bundleID, bundle);
                }
            } catch (error) {
                this._emitError(error);
            }
        }
        return bundle;
    }

    // TODO: update bundle<->file link?
    async deleteFile(fileID: string) {
        this.files.delete(fileID);
        if (this.db) {
            return this.db.delete(this.fileTableName, fileID).catch(this._emitError);
        }
    }

    async deleteBundle(bundleID: string) {
        this.bundles.delete(bundleID);
        if (this.db) {
            return this.db.delete(this.bundleTableName, bundleID).catch(this._emitError);
        }
    }

    async getAllRecordFromDB() {
        if (!this.db) return;
        const files = await this.db.getTable(this.fileTableName).catch(this._emitError);
        if (files) {
            files.forEach((r) => {
                try {
                    let file = JSON.parse(r) as fileRecord;
                    this.files.set(file.id, file);
                } catch (error) {
                    this._emitError(error);
                }
            });
        }
        const bundles = await this.db.getTable(this.bundleTableName).catch(this._emitError);
        if (bundles) {
            bundles.forEach((b) => {
                try {
                    let bundle = JSON.parse(b) as bundleRecord<T>;
                    this.bundles.set(bundle.id, bundle);
                } catch (error) {
                    this._emitError(error);
                }
            });
        }
    }

    async exportJSON(): Promise<VHFSExport<T>> {
        // TODO: optimize: remove JSON conversions for db
        await this.getAllRecordFromDB();
        return {
            bundles: Array.from(this.bundles.values()),
            files: Array.from(this.files.values()),
        };
    }

    async importJSON(json: string | VHFSExport<T>) {
        if (typeof json === 'string') json = JSON.parse(json) as VHFSExport<T>;
        for (let bundle of json.bundles) {
            await this.putBundle(bundle);
        }
        for (let file of json.files) {
            await this.putFile(file);
        }
    }

    _emitError(error: any) {
        if (this.getListenerCount('error') === 0) throw error;
        this.emit('error', error);
    }
}
