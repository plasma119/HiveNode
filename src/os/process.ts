import HiveComponent from '../lib/component.js';
import HiveCommand from '../lib/hiveCommand.js';
import { Constructor } from '../lib/lib.js';
import HiveOS from './os.js';

/*
    OSI model layer 7 - application layer
*/
export default class HiveProcess extends HiveComponent {
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

    initProgram() {
        // main program shell
        return new HiveCommand(this.name);
    }

    exit() {}

    spawnChild<C extends Constructor<HiveProcess>>(name: string, processConstructor: C) {
        return this.os.newProcess(name, processConstructor, this);
    }
}
