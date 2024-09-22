import { DBWrapper } from '../os/processes/db.js';
import BasicEventEmitter from './basicEventEmitter.js';
import { uuidv7 } from './lib.js';

export type VHFSFileRecord = {
    id: string;
    name: string;
    path: string;
    server: string;
    fileStat?: {
        created: number;
        modified: number;
        size: number;
    };
    hash?: {
        hash: string;
        hashTime: number;
    };
    metadata: { [key: string]: any };
    parentBundleIDs: string[];
};

// type bundleRecordType = 'file';
// e.g. new VHFS<bundleRecordType>('foo')
export type VHFSBundleRecord<T> = {
    id: string;
    type: T;
    name: string;
    fileIDs: string[];
    bundleIDs: string[];
    lastUpdate: number;
    metadata: { [key: string]: any };
    parentBundleIDs: string[];
};

export type VHFSExport<T> = {
    bundles: VHFSBundleRecord<T>[];
    files: VHFSFileRecord[];
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
    files: Map<string, VHFSFileRecord> = new Map();
    bundles: Map<string, VHFSBundleRecord<T>> = new Map();

    name: string;
    db?: DBWrapper;
    dbSynchronized: boolean = false;

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

    // TODO: delete record/bundle, remove record form bundle
    async bundleAddFile(bundle: VHFSBundleRecord<T>, file: VHFSFileRecord) {
        if (file.parentBundleIDs.includes(bundle.id)) return;
        file.parentBundleIDs.push(bundle.id);
        await this.putFile(file);
        bundle.fileIDs.push(file.id);
        bundle.lastUpdate = Date.now();
        await this.putBundle(bundle);
    }

    async bundleAddFiles(bundle: VHFSBundleRecord<T>, files: VHFSFileRecord[]) {
        for (let file of files) {
            if (file.parentBundleIDs.includes(bundle.id)) continue;
            file.parentBundleIDs.push(bundle.id);
            await this.putFile(file);
            bundle.fileIDs.push(file.id);
        }
        bundle.lastUpdate = Date.now();
        await this.putBundle(bundle);
    }

    async bundleAddBundle(parent: VHFSBundleRecord<T>, child: VHFSBundleRecord<T>) {
        if (child.parentBundleIDs.includes(parent.id)) return;
        child.parentBundleIDs.push(parent.id);
        child.lastUpdate = Date.now();
        await this.putBundle(child);
        parent.bundleIDs.push(child.id);
        parent.lastUpdate = Date.now();
        await this.putBundle(parent);
    }

    newFile(fileName: string, path: string, server: string): VHFSFileRecord {
        let record: VHFSFileRecord = {
            id: uuidv7(),
            name: fileName,
            path,
            server,
            metadata: {},
            parentBundleIDs: [],
        };
        return record;
    }

    newBundle(type: T, name: string): VHFSBundleRecord<T> {
        let bundle: VHFSBundleRecord<T> = {
            id: uuidv7(),
            type,
            name,
            fileIDs: [],
            bundleIDs: [],
            lastUpdate: Date.now(),
            metadata: {},
            parentBundleIDs: [],
        };
        return bundle;
    }

    async putFile(file: VHFSFileRecord) {
        this.files.set(file.id, file);
        if (this.db) {
            return this.db.put(this.fileTableName, file.id, JSON.stringify(file)).catch(this._emitError);
        }
    }

    async putBundle(bundle: VHFSBundleRecord<T>) {
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
                    file = JSON.parse(fileDB) as VHFSFileRecord;
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
                    bundle = JSON.parse(bundleDB) as VHFSBundleRecord<T>;
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
        if (this.dbSynchronized) return;
        const files = await this.db.getTable(this.fileTableName).catch(this._emitError);
        if (files) {
            files.forEach((r) => {
                try {
                    let file = JSON.parse(r) as VHFSFileRecord;
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
                    let bundle = JSON.parse(b) as VHFSBundleRecord<T>;
                    this.bundles.set(bundle.id, bundle);
                } catch (error) {
                    this._emitError(error);
                }
            });
        }
        this.dbSynchronized = true;
    }

    async export(): Promise<VHFSExport<T>> {
        await this.getAllRecordFromDB();
        return {
            bundles: Array.from(this.bundles.values()),
            files: Array.from(this.files.values()),
        };
    }

    async exportJSON(skipParsing: boolean): Promise<string> {
        if (skipParsing) {
            if (this.db && !this.dbSynchronized) {
                const files = JSON.stringify((await this.db.getTable(this.fileTableName).catch(this._emitError)) || []);
                const bundles = JSON.stringify((await this.db.getTable(this.bundleTableName).catch(this._emitError)) || []);
                return `{"bundles":\n${files},\n"files":\n${bundles}}`;
            }
        }
        await this.getAllRecordFromDB();
        let bundlesString = JSON.stringify(Array.from(this.bundles.values()));
        let filesString = JSON.stringify(Array.from(this.files.values()));
        // {"bundles":[],"files":[]}
        return `{"bundles":\n${bundlesString},\n"files":\n${filesString}}`;
    }

    async import(json: string | VHFSExport<T>) {
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
