import { version } from '../../index.js';
import exitHelper from '../../lib/exitHelper.js';
import HiveCommand from '../../lib/hiveCommand.js';
import { sleep } from '../../lib/lib.js';
import { HIVENETPORT } from '../../network/hiveNet.js';
import HiveProcess from '../process.js';

export default class HiveProcessKernel extends HiveProcess {
    initProgram(): HiveCommand {
        const kernel = new HiveCommand('kernel', `[${this.os.name}] HiveOS ${version} Kernel Shell`);

        // void port
        this.os.HTP.listen(HIVENETPORT.DISCARD);
        // kernel port
        //this.os.HTP.listen(HIVENETPORT.KERNEL).connect(kernel.stdIO);
        // shell port (temporary)
        this.os.HTP.listen(HIVENETPORT.SHELL).connect(kernel.stdIO);
        // node stdIO to net interface
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

        kernel.addNewCommand('panic', 'PANIC').setAction(() => {
            process.nextTick(() => {
                throw new Error('PANIC');
            });
        });

        return kernel;
    }
}
