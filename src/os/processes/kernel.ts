import { version } from '../../index.js';
import exitHelper from '../../lib/exitHelper.js';
import HiveCommand from '../../lib/hiveCommand.js';
import { Constructor, format, sleep } from '../../lib/lib.js';
import DataIO from '../../network/dataIO.js';
import { HIVENETPORT } from '../../network/hiveNet.js';
import { VERSION } from '../../tool/autoBuildVersion.js';
import { CoreServices } from '../os.js';
import HiveProcess from '../process.js';
import HiveProcessDB from './db.js';
import HiveProcessEventLogger from './eventLogger.js';
import HiveProcessLogger from './logger.js';
import HiveProcessNet from './net.js';
import HiveProcessShellDaemon from './shell.js';
import HiveProcessSocketDaemon from './socket.js';
import HiveProcessTerminal from './terminal.js';
import HiveProcessUtil from './util.js';

export default class HiveProcessKernel extends HiveProcess {
    systemShell?: HiveCommand;

    initProgram(): HiveCommand {
        const kernel = new HiveCommand('kernel', `[${this.os.name}] HiveOS ${version} Kernel Shell`);

        // void port
        this.os.HTP.listen(HIVENETPORT.DISCARD);
        // kernel port
        //this.os.HTP.listen(HIVENETPORT.KERNEL).connect(kernel.stdIO);
        // shell port (deprecated)
        //this.os.HTP.listen(HIVENETPORT.SHELL).connect(kernel.stdIO);
        // node stdIO to net interface
        //this.os.stdIO.on('input', kernel.stdIO.inputBind); // force direct input to local kernel
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

        kernel.addNewCommand('status', 'display system status').setAction(() => {
            let str = '';
            const usage = process.memoryUsage();
            const rss = usage.rss / 1024 / 1024;
            const heap = usage.heapUsed / 1024 / 1024;
            const heapMax = usage.heapTotal / 1024 / 1024;
            str += `Platform: ${process.platform}\n`;
            str += `Node release: ${process.release.sourceUrl ? process.release.sourceUrl : 'unknown'}\n`;
            str += `Totoal RSS: ${Math.floor(rss)} MB, Heap: ${Math.floor(heap)}/${Math.floor(heapMax)} MB\n`;
            return str;
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
                    }
                    if (opts['-memory']) {
                        // ... seems like node can hug onto a LOT of memory before blowing up
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
                    }
                    if (opts['-heap']) {
                        // fatal error
                        function heapMemoryOverflow(_args?: any) {
                            let a = new Array(10000).fill(1);
                            const heap = process.memoryUsage().heapUsed / 1024 / 1024;
                            console.log(`${Math.floor(heap)} MB`);
                            heapMemoryOverflow(...a);
                        }
                        heapMemoryOverflow();
                        return;
                    }
                    throw new Error('PANIC');
                });
            });

        return kernel;
    }

    async main() {
        // core services
        const logger = await this._spawnCoreService(HiveProcessLogger, 'logger'); // must be first service to be loaded
        await this._spawnCoreService(HiveProcessEventLogger, 'event');
        this.os.setEventLogger(this.os.newEventLogger('os'));
        this.os.netInterface.setEventLogger(this.os.newEventLogger('os->netInterface'));
        this.os.HTP.setEventLogger(this.os.newEventLogger('os->HTP'));

        await this._spawnCoreService(HiveProcessDB, 'db');

        const shelld = await this._spawnCoreService(HiveProcessShellDaemon, 'shelld');
        shelld.registerShellProgram(this.program);
        shelld.registerShellProgram(logger.program);

        await this._spawnCoreService(HiveProcessTerminal, 'terminal');
        await this._spawnCoreService(HiveProcessSocketDaemon, 'socketd');
        await this._spawnCoreService(HiveProcessNet, 'net');

        // register to shell
        const service = this.program.addNewCommand('service', 'access to core service processes');
        for (let process of Object.values(this.os.coreServices)) {
            service.addCommand(process.program);
        }

        // shell programs
        const util = this.spawnChild(HiveProcessUtil, 'util');
        await util.onReadyAsync();
        shelld.registerShellProgram(util.program);

        // other init

        // TODO: maybe move terminal.build and other init from bootLoader to here?
    }

    private async _spawnCoreService<C extends Constructor<CoreServices[K]>, K extends keyof CoreServices>(constructor: C, serviceName: K) {
        const service = this.spawnChild(constructor, serviceName);
        await service.onReadyAsync();
        this.os.registerCoreService(serviceName, service);
        return service;
    }

    getSystemShell() {
        if (this.systemShell) return this.systemShell;
        let shelld = this.os.getCoreService('shelld');
        let shell = shelld.spawnShell(this, HIVENETPORT.SHELL); // for now
        shell.rename('systemShell');
        let shellProgram = shell.program;
        this.os.stdIO.on('input', shellProgram.stdIO.inputBind, 'system shell input'); // force direct input to system shell
        // placeholder
        // let portIO = this.os.HTP.listen(HIVENETPORT.SHELL);
        // portIO.on('input', shellProgram.stdIO.inputBind);
        // portIO.connect(shellProgram.stdIO);
        this.systemShell = shellProgram;
        return shellProgram;
    }
}
