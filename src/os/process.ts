import { DefaultListener, ListenerSignature } from '../lib/basicEventEmitter.js';
import HiveComponent from '../lib/component.js';
import HiveCommand from '../lib/hiveCommand.js';
import { Constructor } from '../lib/lib.js';
import DataIOScreen from '../network/dataIOScreen.js';
import HiveOS from './os.js';

/*
    OSI model layer 7 - application layer
*/

export type HiveProcessEvents = {
    ready: () => void; // emit after process.main, maybe figure out aysnc main?
    exit: (error?: any) => void;
};

// problem here: DefaultListener is a generic type, so join<> returns a generic type too which fucks up Parameters<T> only for this class
// all due to stupid typescript still doesn't support infer on spread generic parameters
// type join<a, b> = {
//     [k in keyof a | keyof b]: k extends keyof a ? a[k] : k extends keyof b ? b[k] : never;
// };
// either use the stupidParameters in basicEventEmitter and have maximum paramters, plus that stupid error below
// or just accept that only HiveProcess cannot have typescript check on event arguments

export default class HiveProcess<EventList extends ListenerSignature<EventList> = DefaultListener> extends HiveComponent<
    HiveProcessEvents & EventList
> {
    os: HiveOS;
    pid: number;
    ppid: number;
    childs: Map<number, HiveProcess>;

    program: HiveCommand;
    alive: boolean = true;
    screen: DataIOScreen = new DataIOScreen({ includeSignatures: true });

    constructor(name: string, os: HiveOS, pid: number, ppid: number) {
        super(name);
        this.os = os;
        this.pid = pid;
        this.ppid = ppid;
        this.childs = new Map();
        this.program = this.initProgram();
    }

    // override by process
    initProgram() {
        // main program shell
        return new HiveCommand(this.name);
    }

    // override by process
    main(_argv: string[]) {}

    // for debugging purpose, captures complete HiveNet packets + signatures
    enableScreen() {
        this.program.stdIO.on('input', this.screen.stdIO.inputBind, 'screen');
        this.program.stdIO.on('output', this.screen.stdIO.inputBind, 'screen');
    }

    exit(error?: any) {
        this.emit('exit', error);
        this.alive = false;
        // I'm fucking done with typescript
        // @ts-ignore
        this.os.processExitHandle(this);
    }

    spawnChild<C extends Constructor<HiveProcess>>(processConstructor: C, name: string, argv: string[] = []): InstanceType<C> {
        // why the fuck this works here but not the above
        return this.os.newProcess(processConstructor, this, name, argv);
    }
}
