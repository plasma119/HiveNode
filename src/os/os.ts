import exitHelper from '../lib/exitHelper.js';
import HiveCommand from '../lib/hiveCommand.js';
import { Constructor } from '../lib/lib.js';
import { IgnoreSIGINT } from '../lib/signals.js';
import DataIO from '../network/dataIO.js';
import { HiveNetDevice } from '../network/hiveNet.js';
import HiveNetInterface from '../network/interface.js';
import HTP from '../network/protocol.js';
import HiveProcess from './process.js';
import HiveProcessKernel from './processes/kernel.js';
import HiveProcessLogger from './processes/logger.js';
import HiveProcessNet from './processes/net.js';
import HiveProcessTerminal from './processes/terminal.js';

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
        this.kernel.spawnChild('terminal', HiveProcessTerminal);
        this.kernel.spawnChild('logger', HiveProcessLogger);
    }

    registerService(service: HiveCommand) {
        this.kernel.program.addCommand(service);
    }

    getProcess<C extends Constructor<HiveProcess>>(processConstructor: C, process?: HiveProcess): InstanceType<C> | null {
        let result: InstanceType<C> | null = null;
        if (process) {
            if (process instanceof processConstructor) {
                const p2 = process as InstanceType<C>;
                result = p2;
            }
        } else {
            this.processes.forEach((p) => {
                if (p instanceof processConstructor) {
                    const p2 = p as InstanceType<C>;
                    result = p2;
                }
            });
        }
        return result;
    }

    newProcess<C extends Constructor<HiveProcess>>(name: string, processConstructor: C, parentProcess?: HiveProcess) {
        let p = new processConstructor(name, this, this.nextpid++, parentProcess?.pid || 0);
        this.processes.set(p.pid, p);
        if (parentProcess) parentProcess.childs.set(p.pid, p);
        return p;
    }

    buildTerminal(headless: boolean = false, debug: boolean = false) {
        let p = this.getProcess(HiveProcessTerminal);
        if (!p) throw new Error('[ERROR] BuildTerminal failed, cannot find terminal process');
        p.buildTerminal(headless, debug);
    }

    log(message: string) {
        let p = this.getProcess(HiveProcessLogger);
        if (!p) throw new Error('[ERROR] log failed, cannot find logger process');
        p.log(message);
    }
}
