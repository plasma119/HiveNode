import { CircularArray } from '../../lib/circularArray.js';
import HiveCommand from '../lib/hiveCommand.js';
import HiveProcess from '../process.js';

type EventLog = {
    log: string;
    event: string;
    category: string;
    tag: string;
    time: number;
};

const MAXLOGSIZE = 10000;

// Event logger: Record all minor trace events with multi-level labels
//               Also write to os.log level=trace
// TODO: record all minor events in seperated categories for debugging purpose
// Warning: DO NOT capture event for logger/console.log as loglevel 'trace' would cause feedback loop
export default class HiveProcessEventLogger extends HiveProcess {
    events: Map<string, CircularArray<EventLog>> = new Map();
    history: CircularArray<EventLog> = new CircularArray(MAXLOGSIZE);

    root: string = 'null';

    private _log = (tag: string, log: string, event: string, category: string) => {
        let arr = this.events.get(category);
        if (arr == undefined) {
            arr = new CircularArray(MAXLOGSIZE);
            this.events.set(category, arr);
        }
        let eventLog: EventLog = {
            log,
            event,
            category,
            tag,
            time: Date.now(),
        };
        arr.push(eventLog);
        this.history.push(eventLog);
        this.os.log(`[${this.root}][${tag}][${category}][${event}]: ${log}`, 'trace');
    };

    initProgram() {
        const program = new HiveCommand('event', 'HiveComponent event log collector');

        program
            .addNewCommand('ls', 'List logged events')
            .addNewOption('-tag <tag>', 'filter selected tag')
            .addNewOption('-category <category>', 'filter selected category')
            .addNewOption('-event <event>', 'filter selected event')
            .addNewOption('-item <item>', 'max items to display (default 200)')
            .addNewOption('-index <number>', 'starting items index')
            .setAction((_args, opts) => {
                let tag = opts['-tag'] as string;
                let cat = opts['-category'] as string;
                let event = opts['-event'] as string;
                let item = typeof opts['-item'] == 'string' ? Number.parseInt(opts['-item']) : 200;
                if (item <= 0) return `Invalid item size [${item}]`;
                let index = typeof opts['-index'] == 'string' ? Number.parseInt(opts['-index']) : 0;
                if (index <= 0) return `Invalid index [${index}]`;
                let list: EventLog[];
                let str = `Event Logger [${this.root}]\n`;
                if (tag) {
                    list = this.events.get(tag)?.slice() || [];
                    str += `Tag filter: [${tag}]`;
                } else {
                    list = this.history.slice();
                }
                if (cat) {
                    list = list.filter((e) => e.category == cat);
                    str += `Category filter: [${tag}]`;
                }
                if (event) {
                    list = list.filter((e) => e.event == event);
                    str += `Event filter: [${tag}]`;
                }
                let slice = list.slice(index, item);
                str += `Displaying [${slice.length}] log results:\n`;
                str += slice.map((e) => `[${new Date(e.time).toISOString()}][${e.tag}][${e.category}][${e.event}]: ${e.log}`).join('\n');
                str += `[${Math.max(list.length - index - item, 0)}/${list.length}] log results left.`;
                return str;
            });

        return program;
    }

    main(argv: string[]) {
        if (argv[0] && typeof argv[0] == 'string') this.root = argv[0];
        this.setEventLogger(this.newEventLogger('EventLogger'));
    }

    setRoot(root: string) {
        this.logEvent(`[${this.root}]->[${root}]`, 'set root', 'event logger');
        this.root = root;
    }

    appendRoot(root: string) {
        this.setRoot(`${this.root}->${root}`);
    }

    newEventLogger(tag: string = 'unknown') {
        this.logEvent(`tag:[${tag}]`, 'new logger', 'event logger');
        return this._log.bind(this, tag);
    }
}
