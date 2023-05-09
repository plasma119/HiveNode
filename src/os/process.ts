import HiveComponent from '../lib/component.js';
import HiveCommand from '../lib/hiveCommand.js';
import { Constructor } from '../lib/lib.js';
import HiveOS from './os.js';

/*
    OSI model layer 7 - application layer
*/

type HiveProcessEvents = {
    exit: (error?: any) => void
}

export default class HiveProcess extends HiveComponent<HiveProcessEvents> {
    os: HiveOS;
    pid: number;
    ppid: number;
    childs: Map<number, HiveProcess>;

    program: HiveCommand;

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

    exit(error?: any) {
        this.os.processExitHandle(this);
        this.emit('exit', error);
    }

    spawnChild<C extends Constructor<HiveProcess>>(processConstructor: C, name: string, argv: string[] = []): InstanceType<C> {
        return this.os.newProcess(processConstructor, this, name, argv);
    }
}
