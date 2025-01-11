import { CircularBuffer } from '../../lib/circularBuffer.js';
import HiveCommand from '../lib/hiveCommand.js';
import HiveProcess from '../process.js';

type EventLog = { log: string; event: string; category: string; tag: string };

// TODO: record all minor events in seperated categories for debugging purpose
// TODO: maybe add timestamp?
// DO NOT capture event for logger/console.log as loglevel 'trace' would cause feedback loop
export default class HiveProcessEventLogger extends HiveProcess {
    events: Map<string, CircularBuffer<EventLog>> = new Map();
    history: CircularBuffer<EventLog> = new CircularBuffer(1000);

    private _log = (tag: string, log: string, event: string, category: string) => {
        let arr = this.events.get(category);
        if (arr == undefined) {
            arr = new CircularBuffer(1000);
            this.events.set(category, arr);
        }
        let eventLog: EventLog = {
            log,
            event,
            category,
            tag,
        };
        arr.push(eventLog);
        this.history.push(eventLog);
        this.os.log(`[${tag}][${category}][${event}]: ${log}`, 'trace');
    };

    initProgram() {
        const program = new HiveCommand('event', 'HiveComponent event log collector');

        program
            .addNewCommand('ls', 'List logged events')
            .addNewOption('-tag <tag>', 'filter selected tag')
            .addNewOption('-category <category>', 'filter selected category')
            .addNewOption('-event <event>', 'filter selected event')
            .addNewOption('-item <item>', 'max items to display (default 200)')
            .setAction((_args, opts) => {
                let tag = opts['-tag'] as string;
                let cat = opts['-category'] as string;
                let event = opts['-event'] as string;
                let item = typeof opts['-item'] == 'string' ? Number.parseInt(opts['-item']) : 200;
                if (item <= 0) return `Invalid item size`;
                let events: EventLog[];
                if (tag) {
                    events = this.events.get(tag)?.slice() || [];
                    if (events.length === 0) return `Tag [${tag}] has 0 log result`;
                } else {
                    // events = Array.from(this.events.values()).flat();
                    events = this.history.slice();
                }
                if (cat) events = events.filter((e) => e.category == cat);
                if (event) events = events.filter((e) => e.event == event);
                let slice = events.slice(0, item);
                let str = '';
                str += `Displaying [${slice.length}/${events.length}] log results:\n`;
                str += slice.map((e) => `[${e.tag}][${e.category}][${e.event}]: ${e.log}`).join('\n');
                return str;
            });

        return program;
    }

    main() {
        this.setEventLogger(this.newEventLogger('EventLogger'));
    }

    newEventLogger(tag: string = 'unknown') {
        this.logEvent(`tag:[${tag}]`, 'new logger', 'event');
        return this._log.bind(this, tag);
    }
}
