import HiveComponent from '../lib/component.js';
import HiveCommand from '../lib/hiveCommand.js';
import DataIO from './dataIO.js';
import { HiveNetPacket, HIVENETPORT } from './hiveNet.js';
import HTP from './protocol.js';
import HiveNetInterface from './interface.js';
import { version } from '../index.js';

/*
    OSI model layer 6 - presentation layer
*/
export default class HiveNetNode extends HiveComponent {
    stdIO: DataIO = new DataIO(this, 'stdIO');
    netInterface: HiveNetInterface;
    HTP: HTP;
    shell: HiveCommand;

    constructor(name: string, netInterface: HiveNetInterface = new HiveNetInterface(name)) {
        super(name);
        this.netInterface = netInterface;
        this.HTP = new HTP(netInterface);
        this.shell = new HiveCommand();
        this.initShell(this.shell);
        this.initPorts();
    }

    initShell(shell: HiveCommand) {
        shell.addNewCommand('version', 'display HiveNode version').setAction(() => {
            return version;
        });
    }

    initPorts() {
        this.HTP.listen(HIVENETPORT.ECHO, () => {
            return new HiveNetPacket({ data: Date.now(), flags: { pong: true } });
        });

        this.HTP.listen(HIVENETPORT.DISCARD);

        this.HTP.listen(HIVENETPORT.MESSAGE, (data, signatures) => {
            this.stdIO.output(data.data, signatures);
        });

        let shellPortIO = this.HTP.listen(HIVENETPORT.SHELL);
        shellPortIO.connect(this.shell.stdIO);

        let stdIOPortIO = this.HTP.listen(HIVENETPORT.STDIO);
        this.stdIO.passThrough(stdIOPortIO);
    }

    ping(dest: string, options: { timeout?: number; dport?: number } = {}): Promise<string | number[]> {
        return new Promise((resolve) => {
            if (!options.timeout) options.timeout = 3000;
            if (!options.dport) options.dport = HIVENETPORT.ECHO;
            let timeout = false;
            let t1 = Date.now();

            let timer = setTimeout(() => {
                timeout = true;
                resolve('timeout');
            }, options.timeout);

            this.HTP.sendAndReceiveOnce(t1, dest, options.dport, { ping: true })
                .then((data) => {
                    if (timeout) return;
                    clearTimeout(timer);
                    resolve([Date.now() - t1, data.data - t1]);
                })
                .catch(() => resolve('Error'));
        });
    }

    message(dest: string, data: any) {
        this.HTP.send(data, dest, HIVENETPORT.MESSAGE);
    }
}
