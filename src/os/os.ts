import { detectWakeup } from './lib/detectWakeup.js';
import exitHelper from './lib/exitHelper.js';
import HiveCommand from './lib/hiveCommand.js';
import { Constructor, timeFormat } from '../lib/lib.js';
import { IgnoreSIGINT } from './lib/signals.js';
import DataIO from './network/dataIO.js';
import { HiveNetDevice } from './network/hiveNet.js';
import HiveNetInterface from './network/interface.js';
import HTP from './network/protocol.js';
import HiveProcess from './process.js';
import HiveProcessDB from './processes/db.js';
import HiveProcessEventLogger from './processes/eventLogger.js';
import HiveProcessKernel from './processes/kernel.js';
import HiveProcessLogger, { logLevel } from './processes/logger.js';
import HiveProcessNet from './processes/net.js';
import HiveProcessShellDaemon from './processes/shell.js';
import HiveProcessSocketDaemon from './processes/socket.js';
import HiveProcessTerminal from './processes/terminal.js';

// TODO: finish new shell system
// TODO: worker HiveProcess
// TODO: job scheduler

// TODO: add log/trace to all core/important steps for debugging
// TODO: standardize error emit/handling
// TODO: actually use DataIOBuffer
// TODO: define os.debugMode
// TODO: implement processManager
// TODO: add extra info for error catching in HiveCommand
// TODO: client mode OS (since DB is locked to main OS only)

// TODO: re-visit HTP protocol system
// TODO: net command refining
// TODO: seperate terminal control to it's own class + special shell
// TODO: util -> tool to compare integrity of files against NAS version (to repair CM3D2)
// TODO: system shell log
// TODO: coreServices command option -json for easy parsing result
// TODO: HiveCommand import broken
// TODO: fix the confusing UUID for HivePacket destination interface UUID

// TODO: worker thread
// TODO: refactor worker -> HiveNet connection mess

// TODO: central server control system - hiveMind
// TODO: update system
// TODO: boot option select menu

// TODO: dataIO connection to HiveOS for worker - done, but multi-layer is not supported yet

// NAT might cause boradcast storm if reaching to inter-OS HiveNet, need to investigate further
// worker/main script entry point could be specified as option

export type HiveOSEvent = {
    sigint: () => void;
    wakeup: (timePassed: number) => void;
    // fires before console.log
    // WARNING: DO NOT use any DataIO/console.log/logger/eventLogger during capture without safeguard
    consoleLog: (param: { data: any[]; log: Function; suppressBubble: boolean }) => void;
    kernelReady: () => void;
};

export type CoreServices = {
    logger: HiveProcessLogger;
    event: HiveProcessEventLogger;
    db: HiveProcessDB;
    shelld: HiveProcessShellDaemon;
    terminal: HiveProcessTerminal;
    socketd: HiveProcessSocketDaemon;
    net: HiveProcessNet;
};

/*
    OSI model layer 6 - presentation layer
*/
export default class HiveOS extends HiveNetDevice<HiveOSEvent> {
    stdIO: DataIO;
    netInterface: HiveNetInterface;
    HTP: HTP;

    kernel: HiveProcessKernel;
    //@ts-ignore
    shell: HiveCommand;
    coreServices: Partial<CoreServices> = {};

    processes: Map<number, HiveProcess>;
    nextpid: number;
    debugMode: boolean;

    constructor(name: string, debugMode: boolean = false) {
        // TODO: reserve os.name to 'HiveOS' for ease of debugging
        super(name, 'node');
        this.stdIO = new DataIO(this, 'stdIO');
        this.netInterface = new HiveNetInterface(name);
        this.HTP = this.netInterface.HTP;
        this.processes = new Map();
        this.nextpid = 0;
        this.debugMode = debugMode;

        // SIGINT capture
        exitHelper.onSIGINT(() => {
            this.logEvent(``, 'SIGINT', 'system');
            this.log('[OS] SIGINT intercepted', 'debug');
            this.emit('sigint');
            return IgnoreSIGINT;
        });

        // sleep detector
        detectWakeup.init();
        detectWakeup.on('wakeup', (timePassed) => {
            this.logEvent(`Time passed: ${timePassed}`, 'wakeup', 'system');
            this.log(`[OS] Wakeup detected, last timestamp at ${timeFormat('full', '-', ':', ' ', Date.now() - timePassed)}`, 'info');
            this.emit('wakeup', timePassed);
        });

        // capture console.log
        // !! do not redirect this to DataIO or any other console.log with debugMode on -> stackoverflow
        const log = console.log;
        // Error.stackTraceLimit = 100;
        console.log = (...data) => {
            // idk why stackoverflow with DataIO loopback would have a lot of async console.log,
            // causing multiple throw and hard crash the exit system, just let it crash normally
            // let stack = new Error().stack;
            // if (stack) {
            //     let depth = stack.split('\n').length - 1;
            //     if (depth > 80) {
            //         process.stdout.write(stack + '\n');
            //         process.stdout.write(`[console.log](captured) Possible stackoverflow stopped. Current stack at ${depth}`);
            //         throw new Error('Stackoverflow');
            //     }
            // }
            let param = {
                data,
                log,
                suppressBubble: false,
            };
            this.emit('consoleLog', param);
            if (!param.suppressBubble) log(...data);
            // this.stdIO.output(''); // DO NOT DO THIS
        };

        // init system processes
        this.kernel = this.newProcess(HiveProcessKernel, null, 'kernel', []);
        this.kernel.onReady(() => {
            this.shell = this.kernel.getSystemShell();
            this.logEvent(`kernelReady`, 'event', 'system');
            this.log('[OS] Kernel Ready', 'info');
            this.emit('kernelReady');
        });
    }

    // casting type / search for process
    // return null if fails
    getProcess<C extends Constructor<HiveProcess>>(processConstructor: C, process?: HiveProcess | number): InstanceType<C> | null {
        let result: InstanceType<C> | null = null;
        if (process != undefined) {
            if (typeof process == 'number') {
                // PID
                let p = this.processes.get(process);
                if (p) process = p;
            }
            if (process instanceof processConstructor) {
                // process instance
                const p2 = process as InstanceType<C>;
                result = p2;
            }
        } else {
            // didn't specify any process, search for first match
            this.processes.forEach((p) => {
                if (p instanceof processConstructor && result == null) {
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
        const pid = this.nextpid++;
        this.logEvent(
            `${parentProcess ? parentProcess : 'null'}->${processConstructor.name}[${name}]:pid[${pid}] [${argv}]`,
            'new process',
            'system'
        );

        const hiveProcess = new processConstructor(name, this, pid, parentProcess?.pid || 0);
        this.logEvent(`${hiveProcess} program loaded`, 'new process', 'system');

        this.processes.set(hiveProcess.pid, hiveProcess);
        if (parentProcess) parentProcess.childs.set(hiveProcess.pid, hiveProcess);
        try {
            let mainReturn = hiveProcess.main(argv);
            if (typeof mainReturn?.then == 'function') {
                Promise.resolve(mainReturn).then(() => {
                    this.logEvent(`${hiveProcess} process ready`, 'new process', 'system');
                    hiveProcess.ready = true;
                    hiveProcess.emit('ready');
                });
            } else {
                this.logEvent(`${hiveProcess} process ready`, 'new process', 'system');
                hiveProcess.ready = true;
                hiveProcess.emit('ready');
            }
        } catch (e) {
            this.log(`[OS] ERROR: Process ${name} crashed on startup.`, 'error');
            this.log(e, 'error');
            throw e; // if inside HiveCommand, this should be 'safe', otherwise cascade upward to parent
        }
        return hiveProcess as InstanceType<C>;
    }

    processExitHandle(hiveProcess: HiveProcess) {
        const parentProcess = this.getProcess(HiveProcess, hiveProcess.ppid);
        this.logEvent(`${parentProcess ? parentProcess : 'null'}->${hiveProcess}`, 'process exit', 'system');
        this.processes.delete(hiveProcess.pid);
        if (parentProcess && hiveProcess != parentProcess) {
            // move all child to parent process, TODO: maybe kill all child processes?
            parentProcess.childs.delete(hiveProcess.pid);
            hiveProcess.childs.forEach((c) => parentProcess.childs.set(c.pid, c));
        }
    }

    registerCoreService<K extends keyof CoreServices>(service: K, hiveProcess: CoreServices[K]) {
        this.coreServices[service] = hiveProcess;
        this.logEvent(hiveProcess.toString(), 'register', 'core service');
        this.log(`Core Service [${service}] ready`, 'info');
    }

    getCoreService<K extends keyof CoreServices>(service: K): CoreServices[K] {
        const process = this.coreServices[service];
        if (!process) throw new Error(`[OS] ERROR: os.getCoreService failed, core service [${service}] not registered.`);
        return process;
    }

    // maybe move these into kernel?
    registerShellProgram(program: HiveCommand) {
        this.getCoreService('shelld').registerShellProgram(program);
    }

    buildTerminal(headless: boolean = false, debug: boolean = false) {
        this.getCoreService('terminal').buildTerminal(headless, debug);
    }

    log(message: any, level: keyof typeof logLevel) {
        this.getCoreService('logger').log(message, level);
    }

    newEventLogger(tag?: string) {
        return this.getCoreService('event').newEventLogger(tag);
    }
}
