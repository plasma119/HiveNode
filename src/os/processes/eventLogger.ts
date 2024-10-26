import { CircularBuffer } from '../../lib/circularBuffer.js';
import HiveCommand from '../../lib/hiveCommand.js';
import HiveProcess from '../process.js';

type EventCategory = 'portIO' | 'switchIO';
type EventLog = { log: string; event: string; tag: string; category: EventCategory };

// TODO: record all minor events in seperated categories for debugging purpose
// TODO: maybe add timestamp?
// DO NOT capture event for logger/console.log as loglevel 'trace' would cause feedback loop
export default class HiveProcessEventLogger extends HiveProcess {
    events: Map<EventCategory, CircularBuffer<EventLog>> = new Map();
    history: CircularBuffer<EventLog> = new CircularBuffer(1000);

    private _log = (tag: string, log: string, event: string, category: string) => {
        let arr = this.events.get(category as EventCategory);
        if (arr == undefined) {
            arr = new CircularBuffer(1000);
            this.events.set(category as EventCategory, arr);
        }
        let eventLog: EventLog = {
            log,
            event,
            tag,
            category: category as EventCategory,
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
            .addNewOption('-item <item>', 'max items to display (default 50)')
            .setAction((_args, opts) => {
                let cat = opts['-category'] as string;
                let tag = opts['-tag'] as string;
                let event = opts['-event'] as string;
                let item = typeof opts['-item'] == 'string' ? Number.parseInt(opts['-item']) : 50;
                if (item <= 0) return `Invalid item size`;
                let events: EventLog[];
                if (cat) {
                    events = this.events.get(cat as EventCategory)?.slice() || [];
                    if (events.length === 0) return `Category [${cat}] has 0 log result`;
                } else {
                    // events = Array.from(this.events.values()).flat();
                    events = this.history.slice();
                }
                if (tag) events = events.filter((e) => e.tag == tag);
                if (event) events = events.filter((e) => e.event == event);
                let slice = events.slice(0, item);
                let str = '';
                str += `Displaying [${slice.length}/${events.length}] log results:\n`;
                str += slice.map((e) => `[${e.tag}][${e.category}][${e.event}]: ${e.log}`).join('\n');
                return str;
            });

        return program;
    }

    newEventLogger(tag: string = 'unknown') {
        return this._log.bind(this, tag);
    }
}
