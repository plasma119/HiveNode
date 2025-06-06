import { DefaultListener, ListenerSignature } from '../lib/basicEventEmitter.js';
import HiveComponent from './lib/hiveComponent.js';
import HiveCommand from './lib/hiveCommand.js';
import { Constructor } from '../lib/lib.js';
import DataIOBuffer from './network/dataIOBuffer.js';
import HiveOS from './os.js';

/*
    OSI model layer 7 - application layer
*/

interface HiveProcessInterface {
    initProgram: () => HiveCommand;
    main: (argv: string[]) => void | Promise<void>;
}

export type HiveProcessEvents = {
    ready: () => void; // emit after process.main, maybe figure out aysnc main?
    error: (msg: string, error: any) => void; // auto throw error if no error listener
    exit: (error?: any) => void;
};

// problem here: DefaultListener is a generic type, so join<> returns a generic type too which fucks up Parameters<T> only for this class
// all due to stupid typescript still doesn't support infer on spread generic parameters
// type join<a, b> = {
//     [k in keyof a | keyof b]: k extends keyof a ? a[k] : k extends keyof b ? b[k] : never;
// };
// either use the stupidParameters in basicEventEmitter and have maximum paramters, plus that stupid error below
// or just accept that only HiveProcess cannot have typescript check on event arguments

export default class HiveProcess<EventList extends ListenerSignature<EventList> = DefaultListener>
    extends HiveComponent<HiveProcessEvents & EventList>
    implements HiveProcessInterface
{
    os: HiveOS;
    pid: number;
    ppid: number;
    childs: Map<number, HiveProcess>;
    argv: string[];

    program: HiveCommand;
    alive: boolean = true;
    ready: boolean = false;
    IOBuffer: DataIOBuffer = new DataIOBuffer({ includeSignatures: true });

    constructor(name: string, os: HiveOS, pid: number, ppid: number, argv: string[]) {
        super(name);
        this.os = os;
        this.pid = pid;
        this.ppid = ppid;
        this.childs = new Map();
        this.argv = argv;
        this.program = this.initProgram(); // TODO: capture/store program.stdIO contains warning info
        if (os.debugMode) this.enableIOBuffer(); // TODO: actually finish implementing this
    }

    // override by process
    initProgram() {
        // main program shell
        return new HiveCommand(this.name);
    }

    // override by process
    main(_argv: string[]): void | Promise<void> {}

    // for debugging purpose, captures complete HiveNet packets + signatures
    enableIOBuffer() {
        this.program.stdIO.on('input', this.IOBuffer.stdIO.inputBind, 'screen');
        this.program.stdIO.on('output', this.IOBuffer.stdIO.inputBind, 'screen');
    }

    exit(error?: any) {
        this.emit('exit', error);
        this.alive = false;
        this.os.processExitHandle(this);
    }

    spawnChild<C extends Constructor<HiveProcess>>(processConstructor: C, name: string, argv: string[] = []): InstanceType<C> {
        return this.os.newProcess(processConstructor, this, name, argv);
    }

    onReady(callback: () => void) {
        if (this.ready) {
            callback();
        } else {
            // stupid TS
            // @ts-ignore
            this.on('ready', callback);
        }
    }

    onReadyAsync(): Promise<void> {
        return new Promise((resolve) => {
            this.onReady(resolve);
        });
    }

    throwError(msg: string, error: any) {
        if (this.getListenerCount('error') === 0) {
            this.os.log(msg, 'error');
            if (error instanceof Error) {
                throw error;
            } else {
                throw new Error(error || msg);
            }
        } else {
            // stupid TS
            // @ts-ignore
            this.emit('error', msg, error);
        }
    }

    toString() {
        return `${this.constructor.name.replace('HiveProcess', '')}[${this.name}]:pid[${this.pid}]`;
    }
}
