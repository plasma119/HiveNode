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

        kernel.addNewCommand('panic', 'PANIC')
        .addNewOption('-stack', 'generate stackoverflow')
        .setAction((_args, opts) => {
            process.nextTick(() => {
                if (opts['-stack']) {
                    function stackoverflow() {
                        stackoverflow();
                    }
                    stackoverflow();
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
        this.spawnChild(HiveProcessLogger, 'logger');
        this.spawnChild(HiveProcessTerminal, 'terminal');
        this.spawnChild(HiveProcessNet, 'net');
    }

    getSystemShell() {
        if (this.systemShell) return this.systemShell;
        let shelld = this.os.getProcess(HiveProcessShellDaemon);
        if (!shelld) throw new Error('[ERROR] Failed to initialize system shell, cannot find shell daemon process');
        let shell = shelld.spawnShell();
        shell.rename('systemShell');
        let shellProgram = shell.program;
        this.os.stdIO.on('input', shellProgram.stdIO.inputBind); // force direct input to system shell
        // placeholder
        this.os.HTP.listen(HIVENETPORT.SHELL).connect(shellProgram.stdIO);
        this.systemShell = shellProgram;
        return shellProgram;
    }
}
