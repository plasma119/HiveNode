import { version } from '../index.js';
import exitHelper from '../lib/exitHelper.js';
import HiveCommand from '../lib/hiveCommand.js';
import { Constructor, sleep } from '../lib/lib.js';
import { IgnoreSIGINT } from '../lib/signals.js';
import Terminal from '../lib/terminal.js';
import DataIO, { DataTransformer } from '../network/dataIO.js';
import { HIVENETADDRESS, HiveNetDevice, HiveNetPacket, HIVENETPORT } from '../network/hiveNet.js';
import HiveNetInterface from '../network/interface.js';
import HTP from '../network/protocol.js';
import HiveProcess from './process.js';
import { HiveProcessNet } from './processes/net.js';

export type HiveOSEvent = {
    sigint: () => void;
};

/*
    OSI model layer 6 - presentation layer
*/
export default class HiveOS extends HiveNetDevice<HiveOSEvent> {
    stdIO: DataIO;
    netInterface: HiveNetInterface;
    HTP: HTP;

    kernel: HiveProcess;
    drivers = {};

    processes: Map<number, HiveProcess>;
    nextpid: number;
    debugMode: boolean;

    terminal?: Terminal;
    //terminalShell: HiveCommand;
    terminalDest: string = HIVENETADDRESS.LOCAL;

    constructor(name: string, debugMode: boolean = false) {
        super(name, 'node');
        this.stdIO = new DataIO(this, 'stdIO');
        this.netInterface = new HiveNetInterface(name);
        this.HTP = new HTP(this.netInterface);
        this.processes = new Map();
        this.nextpid = 0;
        this.debugMode = debugMode;
        this.kernel = this.newProcess('kernel', HiveProcessKernel);
        //this.terminalShell = new HiveCommand(`${name}-terminalShell`);
        this.startup();
    }

    startup() {
        // TODO: this broke keyboard input...
        exitHelper.onSIGINT(() => {
            this.emit('sigint');
            return IgnoreSIGINT;
        });
        this.kernel.spawnChild('net', HiveProcessNet);
        // let p = this.getProcess(HiveProcessNet);
        // if (p) p.netview();
    }

    registerService(service: HiveCommand) {
        this.kernel.program.addCommand(service);
    }

    getProcess<C extends Constructor<HiveProcess>>(processConstructor: C): InstanceType<C> | null {
        let process: InstanceType<C> | null = null;
        this.processes.forEach((p) => {
            if (p instanceof processConstructor) {
                const p2 = p as InstanceType<C>;
                process = p2;
            }
        });
        return process;
    }

    newProcess<C extends Constructor<HiveProcess>>(name: string, processConstructor: C, parentProcess?: HiveProcess) {
        let p = new processConstructor(name, this, this.nextpid++, parentProcess?.pid || 0);
        this.processes.set(p.pid, p);
        if (parentProcess) parentProcess.childs.set(p.pid, p);
        return p;
    }

    buildTerminal(headless: boolean = false, debug: boolean = false) {
        if (headless) {
            // output only
            this.stdIO.on('output', (data) => console.log(data));
            return;
        }
        // TODO: rework with terminal
        const port = this.HTP.listen(HIVENETPORT.TERMINAL);
        const dt = new DataTransformer(port);
        dt.setInputTransform((data) => {
            // to os
            if (typeof data == 'string' && data[0] == '$') {
                // force input to local shell
                //this.terminalShell.stdIO.input(data.slice(1));
                return new HiveNetPacket({ data: data.slice(1), dest: HIVENETADDRESS.LOCAL, dport: HIVENETPORT.SHELL });
                //return StopPropagation;
            }
            // to target shell
            return new HiveNetPacket({ data, dest: this.terminalDest, dport: HIVENETPORT.SHELL });
        });
        dt.setOutputTransform((data) => {
            // to terminal
            if (data instanceof HiveNetPacket) {
                return data.data;
            }
            return data;
        });
        this.on('sigint', () => {
            if (this.terminalDest != HIVENETADDRESS.LOCAL) {
                this.terminalDest = HIVENETADDRESS.LOCAL;
                port.output('Returning to local shell');
            }
        });
        //this.terminalShell.stdIO.on('output', (data, signatures) => dt.stdIO.output(data, signatures));
        const terminal = new Terminal();
        this.terminal = terminal;
        terminal.connectDevice(process);
        terminal.connectDevice(dt.stdIO);
        this.stdIO.on('output', dt.stdIO.outputBind);
        if (terminal.prompt && debug) terminal.prompt.debug = debug;
    }
}

class HiveProcessKernel extends HiveProcess {
    initProgram(): HiveCommand {
        const kernel = new HiveCommand('kernel', `[${this.os.name}] HiveOS ${version} kernel shell`);

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

        kernel.addNewCommand('stop', 'terminate HiveNode process').setAction(async (_args, _opts, info) => {
            info.reply('stopping...');
            await sleep(100);
            exitHelper.exit();
        });

        kernel.addNewCommand('restart', 'restart HiveNode process').setAction(async (_args, _opts, info) => {
            info.reply('restarting...');
            await sleep(100);
            exitHelper.restart();
        });

        return kernel;
    }
}
