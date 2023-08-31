import { version } from '../../index.js';
import exitHelper from '../../lib/exitHelper.js';
import HiveCommand from '../../lib/hiveCommand.js';
import { sleep } from '../../lib/lib.js';
import DataIO from '../../network/dataIO.js';
import { HIVENETPORT } from '../../network/hiveNet.js';
import HiveProcess from '../process.js';
import HiveProcessLogger from './logger.js';
import HiveProcessNet from './net.js';
import HiveProcessShellDaemon from './shell.js';
import HiveProcessSocketDaemon from './socket.js';
import HiveProcessTerminal from './terminal.js';

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

        kernel.addNewCommand('version', 'display HiveNode version').setAction(() => {
            return version;
        });

        kernel.addNewCommand('status', 'display system status').setAction(() => {
            const heap = process.memoryUsage().heapUsed / 1024 / 1024;
            const heapMax = process.memoryUsage().heapTotal / 1024 / 1024;
            return `This app is currently using ${Math.floor(heap)}/${Math.floor(heapMax)} MB of memory.`;
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

        kernel.addNewCommand('debugDataIO', 'toggle DataIO debug info').setAction(() => DataIO.debugMode());

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

    main() {
        const shelld = this.spawnChild(HiveProcessShellDaemon, 'shelld');
        shelld.registerShellProgram(this.program);
        const logger = this.spawnChild(HiveProcessLogger, 'logger');
        const socketd = this.spawnChild(HiveProcessSocketDaemon, 'socketd');
        const terminal = this.spawnChild(HiveProcessTerminal, 'terminal');
        const net = this.spawnChild(HiveProcessNet, 'net');

        const service = this.program.addNewCommand('service', 'access to service processes');
        service.addCommand(shelld.program);
        service.addCommand(logger.program);
        service.addCommand(socketd.program);
        service.addCommand(terminal.program);
        service.addCommand(net.program);
    }

    getSystemShell() {
        if (this.systemShell) return this.systemShell;
        let shelld = this.os.getProcess(HiveProcessShellDaemon);
        if (!shelld) throw new Error('[ERROR] Failed to initialize system shell, cannot find shell daemon process');
        let shell = shelld.spawnShell(this);
        shell.rename('systemShell');
        let shellProgram = shell.program;
        this.os.stdIO.on('input', shellProgram.stdIO.inputBind); // force direct input to system shell
        // placeholder
        this.os.HTP.listen(HIVENETPORT.SHELL).connect(shellProgram.stdIO);
        this.systemShell = shellProgram;
        return shellProgram;
    }
}
