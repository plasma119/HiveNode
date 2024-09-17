import * as fs from 'fs';

import Level from 'level';

import HiveCommand from '../../lib/hiveCommand.js';
import HiveProcess from '../process.js';

type MasterRecord = {
    tables: string[];
};

export interface DBWrapper {
    get: (table: string, key: string) => Promise<string | null>;
    put: (table: string, key: string, value: string) => Promise<void>;
    getTable: (table: string) => Promise<string[] | null>;
    newTable: (table: string) => Promise<void>;
}

export default class HiveProcessDB extends HiveProcess implements DBWrapper {
    databasePath = 'LevelDB';

    // these should be init in main()
    // @ts-ignore
    database: Level.Level;
    // @ts-ignore
    masterRecord: MasterRecord;

    tableMap: Map<string, boolean> = new Map();

    initProgram() {
        const program = new HiveCommand('db', 'database');

        program.addNewCommand('status', 'display levelDB.supports').setAction(() => {
            return this.database.supports;
        });

        let cmd_get = program.addNewCommand('get');
        cmd_get.addNewArgument('table');
        cmd_get.addNewArgument('key');
        cmd_get.setAction((args) => {
            return this.get(args['table'], args['key']);
        });

        let cmd_put = program.addNewCommand('put');
        cmd_put.addNewArgument('table');
        cmd_put.addNewArgument('key');
        cmd_put.addNewArgument('value...');
        cmd_put.setAction((args) => {
            return this.put(args['table'], args['key'], args['value']);
        });

        // TODO: better format?
        program.addNewCommand('dump').setAction(() => {
            return this.dump();
        });

        return program;
    }

    async main() {
        if (!fs.existsSync(this.databasePath)) {
            this.os.log(`[DB]: Creating folder for Level DB: ${this.databasePath}`, 'info');
            fs.mkdirSync(this.databasePath, { recursive: true });
        }

        this.database = new Level.Level(this.databasePath, { keyEncoding: 'utf8', valueEncoding: 'utf8' });
        await this.database.open();

        let MR = await this._getMasterRecord();
        if (!MR) {
            this.os.log(`[DB]: Initializing Level DB`, 'info');
            MR = await this._initDatabase();
        }
        this.masterRecord = MR;
        MR.tables.forEach((table) => {
            this.tableMap.set(table, true);
        });

        this.os.log(`[DB]: Level DB ready with [${MR.tables.length}] tables`, 'info');
    }

    // TODO: array get/put, complex chain of action
    // TODO: delete record/table
    async get(table: string, key: string) {
        this.os.log(`[DB]: Get [${table}] [${key}]`, 'trace');
        if (!this.tableMap.has(table)) return null;
        return await this.database.get(this._entry(table, key)).catch(() => null);
    }

    async put(table: string, key: string, value: string) {
        this.os.log(`[DB]: Put [${table}] [${key}]`, 'trace');
        if (!this.tableMap.has(table)) this.newTable(table);
        return await this.database.put(this._entry(table, key), value).catch((e) => {
            this.os.log(`[DB]: Put failed, table[${table}] key[${key}] value[${value}]`, 'error');
            this.os.log(e, 'error');
        });
    }

    async getTable(table: string) {
        if (this.tableMap.has(table)) {
            this.os.log(`[DB]: Get table [${table}] failed, table dose not exist!`, 'warn');
            return null;
        }
        this.os.log(`[DB]: Get table [${table}]`, 'trace');
        const header = `T[${table}]-`;
        const values = [];
        for await (const value of this.database.values({ gt: header, lt: header + '\xFF' })) {
            values.push(value);
        }
        return values;
    }

    async newTable(table: string) {
        if (this.tableMap.has(table)) {
            this.os.log(`[DB]: New table [${table}] failed, table already exist!`, 'warn');
            return undefined;
        }
        this.os.log(`[DB]: New table [${table}]`, 'debug');
        this.masterRecord.tables.push(table);
        this.tableMap.set(table, true);
        return await this._putMasterRecord();
    }

    // extracting sublevel: https://github.com/Level/level/issues/238
    async listAllKeys() {
        const keys = [];
        for await (const key of this.database.keys()) {
            keys.push(key);
        }
        return keys;
    }

    async listTableKeys(table: string) {
        const header = `T[${table}]-`;
        const keys = [];
        for await (const key of this.database.keys({ gt: header, lt: header + '\xFF' })) {
            keys.push(key);
        }
        return keys;
    }

    listTables() {
        // TODO: better format?
        return this.masterRecord.tables;
    }

    async dump() {
        const arr: { key: string; value: string }[] = [];
        for await (const [key, value] of this.database.iterator()) {
            arr.push({
                key,
                value,
            });
        }
        return arr;
    }

    // TODO: scrub() : remove empty tables?

    // TODO: export/import

    _entry(table: string, key: string) {
        return `T[${table}]-K[${key}]`;
    }

    async _initDatabase() {
        let MR: MasterRecord = {
            tables: [],
        };
        let str = JSON.stringify(MR);
        await this.database.put('_MasterRecord', str);
        let v = await this.database.get('_MasterRecord').catch(() => null);
        if (str != v) {
            this.os.log(`[DB]: Master Record readback failed during creation`, 'warn');
        }
        return MR;
    }

    async _getMasterRecord() {
        let v = await this.database.get('_MasterRecord').catch(() => null);
        if (!v) return null;
        try {
            let MR = JSON.parse(v);
            return MR as MasterRecord;
        } catch (e) {
            this.os.log(`[DB]: Failed to parse MasterRecord: [${v}]`, 'error');
            return null;
        }
    }

    _putMasterRecord() {
        return this.database.put('_MasterRecord', JSON.stringify(this.masterRecord));
    }
}
