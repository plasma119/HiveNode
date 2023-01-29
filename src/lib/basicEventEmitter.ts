export type ListenerSignature<EventList> = {
    [Event in keyof EventList]: (...args: any[]) => any;
};

export type DefaultListener = {
    [k: string]: (...args: any[]) => any;
};

type Handler = {
    listener: (...args: any[]) => any;
    once: boolean;
    deleted: boolean;
};

export default class BasicEventEmitter<EventList extends ListenerSignature<EventList> = DefaultListener> {
    _events: Map<keyof EventList, Handler[]> = new Map();

    once<Event extends keyof EventList>(event: Event, listener: EventList[Event]): this {
        const handlers = this._getEvent(event);
        handlers.push({
            listener,
            once: true,
            deleted: false
        });
        return this;
    }

    on<Event extends keyof EventList>(event: Event, listener: EventList[Event]): this {
        const handlers = this._getEvent(event);
        handlers.push({
            listener,
            once: false,
            deleted: false
        });
        return this;
    }

    off<Event extends keyof EventList>(event: Event, listener: EventList[Event]): this {
        const handlers = this._getEvent(event);
        for (let handler of handlers) {
            if (handler.deleted) continue;
            if (handler.listener === listener) {
                handler.deleted = true;
                return this;
            }
        }
        return this;
    }

    emit<Event extends keyof EventList>(event: Event, ...args: Parameters<EventList[Event]>): boolean {
        const handlers = this._getEvent(event);
        for (let handler of handlers) {
            if (handler.deleted) continue;
            handler.listener(...args);
            if (handler.once) handler.deleted = true;
        }
        const newHandlers = handlers.filter(handler => !handler.deleted);
        this._events.set(event, newHandlers);
        return true;
    }

    _getEvent<Event extends keyof EventList>(event: Event): Handler[] {
        let handlers = this._events.get(event);
        if (!handlers) {
            handlers = [];
            this._events.set(event, handlers);
        }
        return handlers;
    }
}
