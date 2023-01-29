import { randomUUID } from 'crypto';

import BasicEventEmitter, { DefaultListener, ListenerSignature } from './basicEventEmitter.js';

export default class HiveComponent<EventList extends ListenerSignature<EventList> = DefaultListener> extends BasicEventEmitter<EventList> {
    UUID: string = randomUUID();
    name: string;

    constructor(name: string) {
        super();
        this.name = name;
    }
}
