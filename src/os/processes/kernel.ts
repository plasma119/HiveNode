import { version } from '../../index.js';
import { getLoader } from '../loader.js';
import { CoreServices } from '../os.js';
import HiveProcess from '../process.js';
import exitHelper from '../lib/exitHelper.js';
import HiveCommand from '../lib/hiveCommand.js';
import { Constructor, format, sleep, uuidv7 } from '../../lib/lib.js';
import DataIO from '../network/dataIO.js';
import { HiveNetPacket, HIVENETPORT } from '../network/hiveNet.js';
import { VERSION } from '../../tool/autoBuildVersion.js';
import HiveProcessDB from './db.js';
import HiveProcessEventLogger from './eventLogger.js';
import HiveProcessLogger from './logger.js';
import HiveProcessNet from './net.js';
import HiveProcessShellDaemon from './shell.js';
import HiveProcessSocketDaemon from './socket.js';
import HiveProcessTerminal from './terminal.js';
import HiveProcessUtil from './util.js';
import HiveProcessProcessManager from './processManager.js';
import { DEFAULTCONFIG } from '../bootConfig.js';

export default class HiveProcessKernel extends HiveProcess {
    systemShell?: HiveCommand;

    initProgram(): HiveCommand {
        const kernel = new HiveCommand('kernel', `Kernel Shell[${this.os.name}] HiveOS ${version}`);

        // void port
        this.os.HTP.listen(HIVENETPORT.DISCARD);

        // kernel port
        //this.os.HTP.listen(HIVENETPORT.KERNEL).connect(kernel.stdIO);

        this.os.stdIO.passThrough(this.os.HTP.listen(HIVENETPORT.STDIO));

        kernel
            .addNewCommand('version', 'display HiveNode version')
            .addNewOption('-detail', 'display all file version')
            .setAction((_args, opts) => {
                if (opts['-detail']) {
                    return format(VERSION.files.map((file) => [`${file.path}`, ` -> ${new Date(file.lastModified).toISOString()}`]));
                } else {
                    return version;
                }
            });

        kernel.addNewCommand('stop', 'terminate HiveNode').setAction(async (_args, _opts, info) => {
            info.reply('stopping...');
            await sleep(100);
            exitHelper.exit();
        });

        kernel.addNewCommand('restart', 'restart HiveNode').setAction(async (_args, _opts, info) => {
            info.reply('restarting...');
            await sleep(100);
            exitHelper.restart();
        });

        const debug = kernel.addNewCommand('debug', 'debug control');
        debug.addNewCommand('os', 'toggle os debug info').setAction(() => (this.os.debugMode = !this.os.debugMode));
        debug.addNewCommand('dataIO', 'toggle DataIO debug info').setAction(() => DataIO.debugMode());
        debug
            .addNewCommand('netInterface', 'toggle net interface PortIO trace info')
            .setAction(() => (this.os.netInterface.debugPortIO = !this.os.netInterface.debugPortIO));

        kernel
            .addNewCommand('panic', 'PANIC')
            .addNewOption('-stack', 'generate stack overflow')
            .addNewOption('-memory', 'generate memory overflow')
            .addNewOption('-heap', 'generate heap memory overflow')
            .addNewOption('-promise', 'generate unhandled promise rejection')
            .setAction((_args, opts) => {
                // out of HiveCommand's error catching
                process.nextTick(() => {
                    if (opts['-stack']) {
                        // some stack overflow are recoverable, like this one, logger still works properly
                        function stackoverflow() {
                            stackoverflow();
                        }
                        stackoverflow();
                        return;
                    } else if (opts['-memory']) {
                        // ... seems like node can hang onto a LOT of memory before blowing up
                        function memoryOverflow() {
                            let o = [];
                            for (let i = 0; i < 100; i++) {
                                o[i] = new Array(1000000).fill(1);
                            }
                            const heap = process.memoryUsage().heapUsed / 1024 / 1024;
                            console.log(`${Math.floor(heap)} MB`);
                            memoryOverflow();
                        }
                        memoryOverflow();
                        return;
                    } else if (opts['-heap']) {
                        // fatal error
                        function heapMemoryOverflow(_args?: any) {
                            let a = new Array(10000).fill(1);
                            const heap = process.memoryUsage().heapUsed / 1024 / 1024;
                            console.log(`${Math.floor(heap)} MB`);
                            heapMemoryOverflow(...a);
                        }
                        heapMemoryOverflow();
                        return;
                    } else if (opts['-promise']) {
                        // very evil empty rejection
                        new Promise((_resolve, reject) => reject());
                        return;
                    }
                    throw new Error('PANIC');
                });
            });

        const config = kernel.addNewCommand('config', 'configure system');
        config.addNewCommand('newUUID', 'Create new OS.UUID').setAction(async (_args, _opts, info) => {
            let uuid = uuidv7();
            let prev = this.os.UUID;
            this.os.UUID = uuid;
            this.os.netInterface.UUID = uuid;
            const db = this.os.getCoreService('db');
            if (db.ready) await db.put('os', 'UUID', uuid);
            if (info.rawData instanceof HiveNetPacket && info.rawData.src == prev) {
                info.overrideReplyDestination(uuid);
            }
            return `New OS.UUID: [${uuid}]`;
        });

        return kernel;
    }

    async main() {
        const loder = getLoader();
        const bootConfig = loder.bootConfig;

        // init core services
        const logger = await this._spawnCoreService(HiveProcessLogger, 'logger'); // must be first service to be loaded
        await this._spawnCoreService(HiveProcessEventLogger, 'event', ['OS']);
        this.os.setEventLogger(this.os.newEventLogger('os'));

        logger.log(`HiveNode OS[${this.os.name}] version ${version}`, 'info');

        this.os.netInterface.setEventLogger(this.os.newEventLogger('os->netInterface'));
        this.os.HTP.setEventLogger(this.os.newEventLogger('os->HTP'));

        const db = await this._spawnCoreService(HiveProcessDB, 'db');
        if (db.ready) {
            let uuid = await db.get('os', 'UUID');
            if (uuid) {
                logger.log(`[Kernel]: Loaded OS.UUID [${uuid}]`, 'info');
            } else {
                uuid = this.os.UUID;
                await db.put('os', 'UUID', uuid);
                logger.log(`[Kernel]: New OS.UUID [${uuid}]`, 'info');
            }
            this.os.UUID = uuid;
            this.os.netInterface.UUID = uuid;
        } else {
            this.os.netInterface.UUID = this.os.UUID;
            logger.log(`[Kernel]: Core service [DB] not avaliable`, 'warn');
            logger.log(`[Kernel]: New temporary OS.UUID [${this.os.UUID}]`, 'info');
        }

        const shelld = await this._spawnCoreService(HiveProcessShellDaemon, 'shelld');
        shelld.registerShellProgram(this.program);
        shelld.registerShellProgram(logger.program);

        await this._spawnCoreService(HiveProcessTerminal, 'terminal');
        await this._spawnCoreService(HiveProcessSocketDaemon, 'socketd');
        await this._spawnCoreService(HiveProcessNet, 'net');
        if (
            bootConfig.HiveNetSecret == DEFAULTCONFIG.HiveNetSecret ||
            bootConfig.HiveNetSalt == DEFAULTCONFIG.HiveNetSalt ||
            bootConfig.HiveNetSalt2 == DEFAULTCONFIG.HiveNetSalt2
        ) {
            logger.log('[Kernel]: Default Socket Secret Detected!', 'warn');
        }

        // register core services to shell
        const service = this.program.addNewCommand('service', 'access to core services');
        for (let process of Object.values(this.os.coreServices)) {
            service.addCommand(process.program);
        }

        // init shell programs
        await this._spawnShellProgram(HiveProcessUtil, 'util');
        await this._spawnShellProgram(HiveProcessProcessManager, 'top');

        // init user terminal
        this.os.log(`[Kernel]: Building terminal: Headless[${bootConfig.headless}], Debug[${bootConfig.debug}]`, 'info');
        this.os.buildTerminal(bootConfig.headless, bootConfig.debug);

        // other init
        // start HiveNet server
        if (bootConfig.HiveNetServer) {
            this.os.log(`[Kernel]: Starting HiveNet server...`, 'info');
            await this._executeShellCommand(`net listen -port ${bootConfig.HiveNetPort}`);
        }

        // connect to HiveNet server
        if (bootConfig.HiveNetIP) {
            this.os.log(`[Kernel]: Connecting to HiveNet [${bootConfig.HiveNetIP}]...`, 'info');
            await this._executeShellCommand(`net connect ${bootConfig.HiveNetIP} -port ${bootConfig.HiveNetPort}`);
        }
    }

    private async _spawnCoreService<C extends Constructor<CoreServices[K]>, K extends keyof CoreServices>(
        constructor: C,
        serviceName: K,
        argv?: string[],
    ) {
        const service = this.spawnChild(constructor, serviceName, argv);
        await service.onReadyAsync();
        this.os.registerCoreService(serviceName, service);
        return service;
    }

    private async _spawnShellProgram<C extends Constructor<HiveProcess>, K extends string>(constructor: C, serviceName: K) {
        const service = this.spawnChild(constructor, serviceName);
        await service.onReadyAsync();
        this.os.registerShellProgram(service.program);
        this.os.log(`[Kernel] Shell program [${serviceName}] ready`, 'info');
        return service;
    }

    private async _executeShellCommand(cmd: string) {
        this.os.log(`[Kernel.shell]: ${cmd}`, 'info');
        return await this.getSystemShell().execute(cmd);
    }

    getSystemShell() {
        if (this.systemShell) return this.systemShell;
        let shelld = this.os.getCoreService('shelld');
        let shellProcess = shelld.spawnShell(this, HIVENETPORT.SHELL); // for now
        shellProcess.rename('systemShell');
        let shell = shellProcess.program;
        this.os.stdIO.on('input', shell.stdIO.inputBind, 'system shell input'); // force direct input to system shell
        this.systemShell = shell;
        return shell;
    }
}
