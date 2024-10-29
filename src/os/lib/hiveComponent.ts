import { randomUUID } from 'crypto';

import BasicEventEmitter, { DefaultListener, ListenerSignature } from '../../lib/basicEventEmitter.js';

export type EventLogger = (log: string, event: string, category: string) => void;
const DefaultEventLogger = () => {};

export default class HiveComponent<EventList extends ListenerSignature<EventList> = DefaultListener> extends BasicEventEmitter<EventList> {
    UUID: string = 'UUID-' + randomUUID();
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
