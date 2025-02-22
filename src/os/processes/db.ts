import * as fs from 'fs';

import Level from 'level';

import HiveCommand from '../lib/hiveCommand.js';
import HiveProcess from '../process.js';
import { formatTab } from '../../lib/lib.js';
import { createInterface } from 'readline/promises';
import { byteFormat, timeFormat } from '../../lib/unitFormat.js';

type MasterRecord = {
    tables: string[];
};
const MasterRecordKey = '_MasterRecord';

export interface DBWrapper {
    avaliable: boolean;
    get: (table: string, key: string) => Promise<string | null>;
    put: (table: string, key: string, value: string) => Promise<void>;
    delete: (table: string, key: string) => Promise<void>;
    getTable: (table: string) => Promise<string[] | null>;
    newTable: (table: string) => Promise<void>;
    deleteTable: (table: string) => Promise<void>;
    getMasterRecord: () => MasterRecord;
}

/*
TODO:
recent transaction log
*/
export default class HiveProcessDB extends HiveProcess implements DBWrapper {
    databasePath = 'LevelDB';
    avaliable: boolean = false;

    // these should be init in main()
    // @ts-ignore
    database: Level.Level;
    // @ts-ignore
    masterRecord: MasterRecord;

    tableMap: Map<string, boolean> = new Map();
    tableSizeCache: Map<string, number> = new Map();

    initProgram() {
        const program = new HiveCommand('db', 'database');

        // debug purpose
        // program.addNewCommand('status', 'display levelDB.supports').setAction(() => {
        //     return this.database.supports;
        // });

        program
            .addNewCommand('ls', 'list database tables')
            .addNewOption('-rescan', 'rescan table size')
            .setAction(async (_args, opts, info) => {
                let rescan = !!opts['-rescan'];
                if (rescan) info.reply('Rescanning entire database...');
                let arr: string[] = ['[Table name]\t[Entries]'];
                for (let table of this.getTables()) {
                    arr.push(`${table}\t${await this.getTableSize(table, rescan)}`);
                }
                return formatTab(arr, '   ', '\t');
            });

        program
            .addNewCommand('get')
            .addNewArgument('<table>')
            .addNewArgument('<key>')
            .setAction((args) => {
                return this.get(args['table'], args['key']);
            });

        program
            .addNewCommand('put')
            .addNewArgument('<table>')
            .addNewArgument('<key>')
            .addNewArgument('<value...>')
            .setAction((args) => {
                return this.put(args['table'], args['key'], args['value']);
            });

        program.addNewCommand('masterRecord').setAction(() => {
            return this.getMasterRecord();
        });

        // TODO: better format?
        program.addNewCommand('dump').setAction(() => {
            return this.dump();
        });

        program
            .addNewCommand('export', 'export database')
            .addNewOption('-table <table>', 'export single table')
            .addNewArgument('[filename]', 'filename (default: export)', 'export')
            .setAction(async (args, opts) => {
                if (opts['-table']) {
                    let table = opts['-table'] as string;
                    if (!this.tableMap.has(table)) throw new Error(`Table [${table}] does not exist!`);
                    await this.exportTableToFile(args['filename'], table);
                } else {
                    await this.exportToFile(args['filename']);
                }
                return 'done';
            });

        program
            .addNewCommand('import', 'import database')
            .addNewArgument('[filename]', 'filename (default: export)', 'export')
            .setAction(async (args) => {
                await this.importFile(args['filename']);
                return 'done';
            });

        return program;
    }

    async main() {
        this.setEventLogger(this.os.newEventLogger('DB'));

        // init DB
        if (!fs.existsSync(this.databasePath)) {
            this.os.log(`[DB] Creating folder for Level DB: ${this.databasePath}`, 'info');
            fs.mkdirSync(this.databasePath, { recursive: true });
        }
        this.database = new Level.Level(this.databasePath, { keyEncoding: 'utf8', valueEncoding: 'utf8' });
        let error = await this.database.open().catch((e) => e as Error);
        if (error) {
            // @ts-ignore
            if (error.code === 'LEVEL_LOCKED' || (error.cause && error.cause.code === 'LEVEL_LOCKED')) {
                this.os.log(`[DB] Level DB is locked, perhaps this is client OS?`, 'error');
            } else {
                this.os.log(error, 'error');
            }
            this.os.log(`[DB] Level DB not avaliable`, 'warn');
            this.avaliable = false;
            return;
        }

        // load master record
        let MR = await this._getMasterRecord();
        if (!MR) {
            this.os.log(`[DB] Initializing Level DB`, 'info');
            MR = await this._initDatabase();
        }
        this.masterRecord = MR;
        MR.tables.forEach((table) => {
            this.tableMap.set(table, true);
        });

        this.os.log(`[DB] Level DB ready with [${MR.tables.length}] tables`, 'info');
        this.avaliable = true;
    }

    // TODO: array get/put, complex chain of action
    async get(table: string, key: string) {
        this.logEvent(`[${table}] [${key}]`, 'GET', 'DB');
        if (!this.tableMap.has(table)) return null;
        return await this.database.get(this._entry(table, key)).catch((e) => {
            this.logEvent(`${e}`, 'GET', 'DB');
            return null;
        });
    }

    async put(table: string, key: string, value: string) {
        this.logEvent(`[${table}] [${key}] ${value.length} Bytes`, 'PUT', 'DB');
        const entryKey = this._entry(table, key);
        const newEntry = await this.database.get(entryKey).catch(() => null);
        const size = newEntry ? await this.getTableSize(table) : 0;
        if (!this.tableMap.has(table)) this.newTable(table);
        await this.database.put(entryKey, value).catch((e) => {
            this.logEvent(`${e}`, 'PUT', 'DB');
            this.os.log(`[DB] Put failed, table[${table}] key[${key}] value[${value}]`, 'error');
            this.os.log(e, 'error');
        });
        if (newEntry) this._setTableSize(table, size + 1);
        return;
    }

    async delete(table: string, key: string) {
        this.logEvent(`[${table}] [${key}]`, 'DELETE', 'DB');
        if (!this.tableMap.has(table)) return;
        const entryKey = this._entry(table, key);
        const hasEntry = await this.database.get(entryKey).catch(() => null);
        if (!hasEntry) return;
        const size = await this.getTableSize(table);
        await this.database.del(entryKey).catch((e) => {
            this.logEvent(`${e}`, 'DELETE', 'DB');
        });
        this._setTableSize(table, size - 1);
        return;
    }

    async getTable(table: string) {
        this.logEvent(`[${table}]`, 'GET', 'Table');
        if (!this.tableMap.has(table)) {
            this.logEvent(`Table [${table}] not found.`, 'GET', 'Table');
            this.os.log(`[DB] Get table [${table}] failed, table dose not exist!`, 'warn');
            return null;
        }
        const header = `T[${table}]-`;
        const values = [];
        for await (const value of this.database.values({ gt: header, lt: header + '\xFF' })) {
            values.push(value);
        }
        return values;
    }

    async newTable(table: string) {
        this.logEvent(`[${table}]`, 'NEW', 'Table');
        if (this.tableMap.has(table)) {
            this.logEvent(`Table [${table}] already exist.`, 'NEW', 'Table');
            this.os.log(`[DB] New table [${table}] failed, table already exist!`, 'warn');
            return;
        }
        this.masterRecord.tables.push(table);
        this.tableMap.set(table, true);
        this._setTableSize(table, 0);
        return await this._putMasterRecord();
    }

    async deleteTable(table: string) {
        this.logEvent(`[${table}]`, 'DELETE', 'Table');
        if (!this.tableMap.has(table)) {
            this.logEvent(`Table [${table}] not found.`, 'DELETE', 'Table');
            this.os.log(`[DB] Delete table [${table}] failed, table dose not exist!`, 'warn');
            return;
        }
        // delete table entries
        const iterator = this.tableKeyIterator(table);
        for await (const key of iterator) {
            await this.database.del(key).catch((e) => {
                this.logEvent(`${e}`, 'DELETE', 'Table');
            });
        }
        this.logEvent(`Table [${table}] deleted with [${iterator.count}] entries`, 'DELETE', 'Table');
        iterator.close();
        // delete table record
        this.database.del(`_TS[${table}]`);
        this.masterRecord.tables = this.masterRecord.tables.filter((t) => t != table);
        this.tableMap.delete(table);
        return await this._putMasterRecord();
    }

    getMasterRecord() {
        return this.masterRecord;
    }

    getTables() {
        return this.masterRecord.tables;
    }

    async getTableSize(table: string, forceRescan: boolean = false, skipScan: boolean = false): Promise<number> {
        if (!this.tableMap.has(table)) return 0;
        if (forceRescan) return this._scanTableSize(table);
        const key = `_TS[${table}]`;
        // check cache
        let cache = this.tableSizeCache.get(key);
        if (cache) return cache;
        // cache miss
        let sizeStr = await this.database.get(key).catch(() => null);
        if (sizeStr) {
            let size = Number.parseInt(sizeStr);
            await this._setTableSize(table, size);
            return size;
        }
        // no record
        return skipScan ? 0 : this._scanTableSize(table);
    }

    async _scanTableSize(table: string): Promise<number> {
        this.logEvent(`Scanning table [${table}]...`, 'scan size', 'Table');
        let size = 0;
        const iterator = this.tableKeyIterator(table);
        for await (const _ of iterator) size++;
        iterator.close();
        await this._setTableSize(table, size);
        this.logEvent(`Table [${table}] has [${size}] entries`, 'scan size', 'Table');
        return size;
    }

    async _setTableSize(table: string, size: number) {
        const key = `_TS[${table}]`;
        await this.database.put(key, size.toString()).catch(() => null);
        this.tableSizeCache.set(key, size);
    }

    // extracting sublevel: https://github.com/Level/level/issues/238
    keyIterator() {
        return this.database.keys();
    }

    valueIterator() {
        return this.database.values();
    }

    iterator() {
        return this.database.iterator();
    }

    tableKeyIterator(table: string, startFrom: string = '') {
        const header = `T[${table}]-`;
        return this.database.keys({ gt: header + startFrom, lt: header + '\xFF' });
    }

    tableValueIterator(table: string, startFrom: string = '') {
        const header = `T[${table}]-`;
        return this.database.values({ gt: header + startFrom, lt: header + '\xFF' });
    }

    tableIterator(table: string, startFrom: string = '') {
        const header = `T[${table}]-`;
        return this.database.iterator({ gt: header + startFrom, lt: header + '\xFF' });
    }

    // DEBUG, to be removed
    async dump() {
        const arr: { key: string; value: string }[] = [];
        const iterator = this.database.iterator();
        for await (const [key, value] of iterator) {
            arr.push({
                key,
                value,
            });
        }
        await iterator.close();
        return arr;
    }

    // TODO: scrub() : remove empty tables?

    // TODO: export/import
    exportToFile(filename: string) {
        this.logEvent(`[${filename}]`, 'ALL', 'export file');
        this.os.log(`[DB] Export: exporting to file [${filename}]...`, 'info');
        return this._exportToFile(filename, this.iterator());
    }

    exportTableToFile(filename: string, table: string) {
        this.logEvent(`[${filename}]`, 'TABLE', 'export file');
        this.os.log(`[DB] Export: exporting Table[${table}] to file [${filename}]...`, 'info');
        return this._exportToFile(filename, this.tableIterator(table));
    }

    // TODO: more logging
    async _exportToFile(filename: string, iterator: Level.Iterator<Level.Level, string, string>) {
        if (fs.existsSync(filename)) {
            this.os.log(`[DB] Export: file [${filename}] already exist! Overwriting file now...`, 'warn');
            fs.writeFileSync(filename, '');
        }
        const t1 = Date.now();
        const stream = fs.createWriteStream(filename);

        let keys = 0;
        let size = 0;

        for await (const [key, value] of iterator) {
            // TODO: maybe better formatting to skip encode/decode value?
            const ableToWrite = stream.write(`["${key}",${JSON.stringify(value)}]\r\n`);
            keys++;
            size += value.length;
            if (!ableToWrite) {
                await new Promise((resolve) => {
                    stream.once('drain', resolve);
                });
            }
        }

        await iterator.close();
        await new Promise((resolve) => {
            stream.close(resolve);
        });
        this.logEvent(`[${keys}] entries ${byteFormat(size)}`, '_export', 'export file');
        this.os.log(`[DB] Export: [${keys}] entries ${byteFormat(size)}`, 'info');
        this.logEvent(`export finished in ${timeFormat(Date.now() - t1)}.`, '_export', 'export file');
        this.os.log(`[DB] Export: finished in ${timeFormat(Date.now() - t1)}.`, 'info');
    }

    async importFile(filename: string) {
        this.logEvent(`[${filename}]`, 'import', 'import file');
        this.os.log(`[DB] Import: importing from file [${filename}]...`, 'info');
        if (!fs.existsSync(filename)) throw new Error(`[DB] Import: file [${filename}] dose not exist!`);
        const t1 = Date.now();
        const stream = fs.createReadStream(filename);

        const rl = createInterface({
            input: stream,
            crlfDelay: Infinity, // to recognize all CR LF ('\r\n') as single line break.
        });

        let MR: MasterRecord | undefined;
        let tableMap: Map<string, { keys: number; size: number }> = new Map();
        let keys = 0;
        let tables = 0;
        let size = 0;

        for await (const line of rl) {
            try {
                let [K, value]: [string, string] = JSON.parse(line);
                let index = K.indexOf(']-K[', 2);
                if (index > 0) {
                    // normal entry
                    let table = K.slice(2, index);
                    let key = K.slice(index + 4, -1);
                    await this.put(table, key, value); // slower but have item counter and logging
                    let record = tableMap.get(table);
                    if (!record) {
                        record = { keys: 0, size: 0 };
                        tableMap.set(table, record);
                        tables++;
                    }
                    record.keys++;
                    record.size += value.length;
                    keys++;
                    size += value.length;
                    // this.database.put(K, value);
                } else if (K == MasterRecordKey) {
                    // master record
                    MR = JSON.parse(value);
                } else if (K.startsWith('_')) {
                    // db record
                    this.os.log(`[DB] import: skipping DB record Key[${K}] Value[${value}]`, 'info');
                } else {
                    // unknown
                    this.os.log(`[DB] import: unknown Key[${K}] Value[${value}]`, 'warn');
                }
            } catch (e) {
                this.os.log('[DB] import: failed to parse line:', 'warn');
                this.os.log(line, 'warn');
                this.os.log((e as Error).message, 'warn');
            }
        }
        await new Promise((resolve) => {
            stream.close(resolve);
        });

        if (MR) {
            this.masterRecord = MR;
            this._putMasterRecord();
        }
        let arr: string[] = ['[Table name]\t[Entries]\t[Size]'];
        for (const [table, record] of tableMap.entries()) {
            arr.push(`${table}\t${record.keys}\t${byteFormat(record.size)}`);
        }
        arr.push(`Total\t${keys}\t${byteFormat(size)}`);
        let result = formatTab(arr, '   ', '\t');
        this.logEvent(`${result}`, 'import', 'import file');
        this.os.log(`[DB] Import: \n${result}`, 'info');
        this.logEvent(`import finished in ${timeFormat(Date.now() - t1)}.`, 'import', 'import file');
        this.os.log(`[DB] Import: finished in ${timeFormat(Date.now() - t1)}.`, 'info');
    }

    _entry(table: string, key: string) {
        return `T[${table}]-K[${key}]`;
    }

    async _initDatabase() {
        this.logEvent(`INIT`, 'INIT', 'Master Record');
        const MR: MasterRecord = {
            tables: [],
        };
        let str = JSON.stringify(MR);
        await this.database.put(MasterRecordKey, str);
        // sanity check
        let json = await this.database.get(MasterRecordKey).catch(() => null);
        if (str != json) {
            this.os.log(`[DB] Master Record readback failed during creation`, 'warn');
        }
        return MR;
    }

    async _getMasterRecord() {
        this.logEvent(`GET`, 'GET', 'Master Record');
        const json = await this.database.get(MasterRecordKey).catch(() => null);
        if (!json) {
            this.logEvent(`Master record not found.`, 'GET', 'Master Record');
            return null;
        }
        try {
            const MR = JSON.parse(json);
            this.logEvent(`[${MR.tables.length}] tables`, 'GET', 'Master Record');
            return MR as MasterRecord;
        } catch (e) {
            this.logEvent(`Parsing failed.`, 'GET', 'Master Record');
            this.os.log(`[DB] Failed to parse MasterRecord: [${json}]`, 'error');
            return null;
        }
    }

    _putMasterRecord() {
        this.logEvent(`[${this.masterRecord.tables.length}] tables`, 'PUT', 'Master Record');
        return this.database.put(MasterRecordKey, JSON.stringify(this.masterRecord));
    }
}
