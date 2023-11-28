export type ListenerSignature<EventList> = {
    [k in keyof EventList]: (...args: any) => any;
};

export type DefaultListener = {
    [k: string | number | symbol]: (...args: any) => any;
};

// stupid typescript still doesn't support infer on spread generic parameters
type StupidParameters<T extends (arg1: any, arg2: any, arg3: any) => any> = T extends (arg1: infer P, args2: any, args3: any) => any ? P : never;
type StupidParameters2<T extends (arg1: any, arg2: any, arg3: any) => any> = T extends (arg1: any, args2: infer P, args3: any) => any ? P : never;
type StupidParameters3<T extends (arg1: any, arg2: any, arg3: any) => any> = T extends (arg1: any, args2: any, args3: infer P) => any ? P : never;

type Handler = {
    listener: (...args: any) => any;
    once: boolean;
    deleted: boolean;
    label?: string;
};

export default class BasicEventEmitter<EventList extends ListenerSignature<EventList> = DefaultListener> {
    _events: Map<keyof EventList, Handler[]> = new Map();

    once<Event extends keyof EventList>(event: Event, listener: EventList[Event], label?: string): this {
        const handlers = this._getEvent(event);
        handlers.push({
            listener,
            once: true,
            deleted: false,
            label,
        });
        return this;
    }

    on<Event extends keyof EventList>(event: Event, listener: EventList[Event], label?: string): this {
        const handlers = this._getEvent(event);
        handlers.push({
            listener,
            once: false,
            deleted: false,
            label,
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

    emit<Event extends keyof EventList>(
        event: Event,
        arg1?: StupidParameters<EventList[Event]>,
        arg2?: StupidParameters2<EventList[Event]>,
        arg3?: StupidParameters3<EventList[Event]>
    ): this {
        const handlers = this._getEvent(event);
        let updated = false;
        for (let handler of handlers) {
            if (handler.deleted) {
                updated = true;
                continue;
            }
            handler.listener(arg1, arg2, arg3);
            if (handler.once) {
                handler.deleted = true;
                updated = true;
            }
        }
        if (!updated) return this;
        const newHandlers = handlers.filter((handler) => !handler.deleted);
        this._events.set(event, newHandlers);
        return this;
    }

    getListenerCount<Event extends keyof EventList>(event: Event): number {
        const handlers = this._getEvent(event);
        return handlers.length;
    }

    getListeners<Event extends keyof EventList>(event: Event): Handler[] {
        if (!this._events.has(event)) return [];
        const handlers = this._getEvent(event);
        return handlers;
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
