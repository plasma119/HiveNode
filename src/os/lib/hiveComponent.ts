import BasicEventEmitter, { DefaultListener, ListenerSignature } from '../../lib/basicEventEmitter.js';
import { uuidv7 } from '../../lib/lib.js';

export type EventLogger = (log: string, event: string, category: string) => void;
const DefaultEventLogger = () => {};

export default class HiveComponent<EventList extends ListenerSignature<EventList> = DefaultListener> extends BasicEventEmitter<EventList> {
    UUID: string = uuidv7();
    name: string;
    logEvent: EventLogger = DefaultEventLogger;

    constructor(name: string) {
        super();
        this.name = name;
    }

    setEventLogger(eventLogger: EventLogger) {
        this.logEvent = eventLogger;
    }
}
