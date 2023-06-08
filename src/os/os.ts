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
import HiveProcessShellDaemon from './processes/shell.js';
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

    kernel: HiveProcessKernel;
    shell: HiveCommand;
    drivers = {}; // TODO

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
        exitHelper.onSIGINT(() => {
            this.emit('sigint');
            return IgnoreSIGINT;
        });
        this.kernel = this.newProcess(HiveProcessKernel, null, 'kernel', []);
        this.shell = this.kernel.getSystemShell();
    }

    getProcess<C extends Constructor<HiveProcess>>(processConstructor: C, process?: HiveProcess | number): InstanceType<C> | null {
        let result: InstanceType<C> | null = null;
        if (process) {
            if (typeof process == 'number') {
                let p = this.processes.get(process);
                if (p) process = p;
            }
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

    newProcess<C extends Constructor<HiveProcess>>(
        processConstructor: C,
        parentProcess: HiveProcess | null,
        name: string,
        argv: string[]
    ): InstanceType<C> {
        let p = new processConstructor(name, this, this.nextpid++, parentProcess?.pid || 0);
        this.processes.set(p.pid, p);
        if (parentProcess) parentProcess.childs.set(p.pid, p);
        p.main(argv);
        p.emit('ready');
        return p as InstanceType<C>;
    }

    processExitHandle(process: HiveProcess) {
        const parent = this.getProcess(HiveProcess, process.pid);
        this.processes.delete(process.pid);
        if (parent && process != parent) {
            parent.childs.delete(process.pid);
            process.childs.forEach((c) => parent.childs.set(c.pid, c));
        }
    }

    // maybe move these into kernel?
    registerShellProgram(program: HiveCommand) {
        let p = this.getProcess(HiveProcessShellDaemon);
        if (!p) throw new Error('[ERROR] os.registerShellProgram failed, cannot find shelld process');
        p.registerShellProgram(program);
    }

    buildTerminal(headless: boolean = false, debug: boolean = false) {
        let p = this.getProcess(HiveProcessTerminal);
        if (!p) throw new Error('[ERROR] os.buildTerminal failed, cannot find terminal process');
        p.buildTerminal(headless, debug);
    }

    log(message: any) {
        let p = this.getProcess(HiveProcessLogger);
        if (!p) throw new Error('[ERROR] os.log failed, cannot find logger process');
        p.log(message);
    }
}
