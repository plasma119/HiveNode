import * as fs from 'fs';

import Level from 'level';

import HiveCommand from '../../lib/hiveCommand.js';
import HiveProcess from '../process.js';

type MasterRecord = {
    tables: string[];
};

export default class HiveProcessDB extends HiveProcess {
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
    get(table: string, key: string) {
        this.os.log(`[DB]: Get [${table}] [${key}]`, 'trace');
        if (!this.tableMap.has(table)) return '';
        return this.database.get(this._entry(table, key)).catch(() => null);
    }

    put(table: string, key: string, value: string) {
        this.os.log(`[DB]: Put [${table}] [${key}]`, 'trace');
        if (!this.tableMap.has(table)) this.newTable(table);
        return this.database.put(this._entry(table, key), value);
    }

    newTable(table: string) {
        if (this.tableMap.has(table)) return;
        this.os.log(`[DB]: New table [${table}]`, 'debug');
        this.masterRecord.tables.push(table);
        this.tableMap.set(table, true);
        return this._putMasterRecord();
    }

    // extracting sublevel: https://github.com/Level/level/issues/238
    async listAllKeys() {
        const iterator = this.database.keys({ keyEncoding: 'utf8' });
        const keys: string[] = [];
        let key = await iterator.next();
        try {
            while (key) {
                keys.push(key);
                key = await iterator.next();
            }
        } finally {
            await iterator.close();
        }

        return keys;
    }

    async listTableKeys(table: string) {
        const header = `T[${table}]-`;
        const iterator = this.database.keys({ keyEncoding: 'utf8', gte: header });
        const keys: string[] = [];
        let key = await iterator.next();
        try {
            while (key) {
                if (!key.startsWith(header)) break;
                keys.push(key.slice(header.length + 2, key.length - 1));
                key = await iterator.next();
            }
        } finally {
            await iterator.close();
        }

        return keys;
    }

    listTables() {
        // TODO: better format?
        return this.masterRecord.tables;
    }

    async dump() {
        const arr: { key: string; value: string }[] = [];
        for await (const [key, value] of this.database.iterator({ keyEncoding: 'utf8' })) {
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
