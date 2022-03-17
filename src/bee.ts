
import DataIO, { DataSignature, DataTransformer } from "./lib/dataIO.js";
import { StopPropagation } from './lib/signals.js';
import HiveProgram from "./lib/hiveProgram.js";

let id = 1;

type DataLog = {
    data: any,
    signatures: DataSignature[]
}

export default class Bee {
    name: string;
    UID: number;
    stdIO: DataIO;
    program: HiveProgram;
    programDT: DataTransformer;
    screen: DataLog[];
    screenLimit: number = 1000;

    constructor(name: string) {
        this.name = name;
        this.UID = id++;
        this.stdIO = new DataIO(this, `${name}-stdIO`);
        this.program = new HiveProgram(`${name}-Core`);
        this.screen = [];
        this.programDT = new DataTransformer(this.program.stdIO);
        this.stdIO.passThrough(this.programDT.stdIO);
        this.programDT.inputTransform = (data, signatures) => {
            this._record({data, signatures});
            try {
                this.program.stdIO.input(data, signatures);
            } catch (e) {
                if (e instanceof Error) {
                    this.program.stdIO.output(e.message);
                } else {
                    this.program.stdIO.output(e);
                }
            }
            return StopPropagation;
        }
        this.programDT.outputTransform = (data, signatures) => {
            this._record({data, signatures});
            return data;
        }
        this.init();
    }

    init() {
        this.program.addNewCommand('rickroll', 'lol')
            .addNewArgument('[never]', 'gonna')
            .addNewArgument('[give]', 'you')
            .addNewArgument('[up]', ':)')
            .setAction(() => {
                return 'DUM\n';
            })
    }

    _record(log: DataLog) {
        this.screen.push(log);
        if (this.screen.length > this.screenLimit) this.screen.shift();
    }
}