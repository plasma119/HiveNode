import HiveCommand from '../lib/hiveCommand.js';
import { sleep } from '../lib/lib.js';
import DataIO from './dataIO.js';
import { HiveNetDevice, HIVENETPORT } from './hiveNet.js';
import HTP from './protocol.js';
import HiveNetInterface from './interface.js';
import { version } from '../index.js';
import HiveApp from '../app/app.js';
import HiveAppNet from '../app/net.js';

/*
    OSI model layer 6 - presentation layer
*/
export default class HiveNetNode extends HiveNetDevice {
    stdIO: DataIO = new DataIO(this, 'stdIO');
    netInterface: HiveNetInterface;
    HTP: HTP;
    shell: HiveCommand;

    stdIOPortIO?: DataIO;

    apps: Map<string, HiveApp> = new Map();

    constructor(name: string) {
        super(name, 'node');
        this.netInterface = new HiveNetInterface(name);
        this.HTP = new HTP(this.netInterface);
        this.shell = new HiveCommand();
        this.initShell(this.shell);
        this.initPorts();
    }

    initShell(shell: HiveCommand) {
        let s = shell.addNewCommand('shell', 'Shell command line');

        let apps = [new HiveAppNet(this)];
        apps.forEach((app) => {
            app.initProgram(s);
        });

        s.addNewCommand('version', 'display HiveNode version').setAction(() => {
            return version;
        });

        s.addNewCommand('whoami', 'display UUID of node net interface').setAction(() => this.netInterface.UUID);

        s.addNewCommand('exit', 'terminate this node process').setAction(async (_args, _opts, info) => {
            info.reply('exiting...');
            await sleep(1000);
            process.exit();
        });
    }

    initPorts() {
        // void
        this.HTP.listen(HIVENETPORT.DISCARD);

        // shell port
        let shellPortIO = this.HTP.listen(HIVENETPORT.SHELL);
        shellPortIO.connect(this.shell.stdIO);

        // stdIO port
        this.stdIOPortIO = this.HTP.listen(HIVENETPORT.STDIO);
        this.stdIO.passThrough(this.stdIOPortIO);
    }
}
