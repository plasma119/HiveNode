// reference: https://github.com/rsms/js-lru
/**
 * A doubly linked list-based Least Recently Used (LRU) cache. Will keep most
 * recently used items while discarding least recently used items when its limit
 * is reached.
 */
export default class LRUMap<K, V> {
    size: number = 0;
    limit: number;

    private _map: Map<K, Node<K, V>> = new Map();
    head?: Node<K, V>; // newest node
    tail?: Node<K, V>; // oldest node

    constructor(limit?: number, iterable?: Iterable<[K, V]>) {
        this.limit = limit || Infinity;
        if (this.limit < 0) this.limit = 0;
        if (iterable) {
            if (limit === undefined) this.limit = Infinity;
            this.assign(iterable);
            if (limit === undefined) this.limit = this.size;
        }
    }

    _getNode(key: K) {
        const node = this._map.get(key);
        if (!node) return;
        if (node === this.head) return node;
        // update most recently used node
        if (node.prev) {
            if (node === this.tail) this.tail = node.prev;
            node.prev.next = node.next;
        }
        if (node.next) {
            node.next.prev = node.prev;
        }
        node.prev = undefined;
        node.next = this.head;
        if (this.head) {
            this.head.prev = node;
        }
        this.head = node;
        return node;
    }

    assign(iterable: Iterable<[K, V]>) {
        for (let [key, value] of iterable) {
            this.set(key, value);
        }
    }

    get(key: K) {
        const node = this._getNode(key);
        if (node) return node.value;
        return;
    }

    set(key: K, value: V) {
        let node = this._getNode(key);
        if (node) {
            // cached
            node.value = value;
            return this;
        }

        // new node
        node = new Node(key, value);
        this._map.set(key, node);
        if (this.head) {
            node.next = this.head;
            this.head.prev = node;
        }
        if (!this.tail) {
            this.tail = node;
        }
        this.head = node;

        ++this.size;
        if (this.size > this.limit) {
            this.pop();
        }

        return this;
    }

    pop() {
        const node = this.tail;
        if (node) {
            if (node.prev) {
                node.prev.next = undefined;
                this.tail = node.prev;
            } else {
                // last node in list
                this.head = undefined;
                this.tail = undefined;
            }
            node.next = node.prev = undefined;
            this._map.delete(node.key);
            --this.size;
            return [node.key, node.value];
        }
        return;
    }

    has(key: K) {
        return this._map.has(key);
    }

    delete(key: K) {
        const node = this._map.get(key);
        if (!node) return;
        this._map.delete(key);
        if (node.prev && node.next) {
            // node is in the middle
            node.prev.next = node.next;
            node.next.prev = node.prev;
        } else if (node.prev) {
            // node is tail
            node.prev.next = undefined;
            this.tail = node.prev;
        } else if (node.next) {
            // node is head
            node.next.prev = undefined;
            this.head = node.next;
        } else {
            // single node
            this.tail = this.head = undefined;
        }

        this.size--;
        return node.value;
    }

    resize(limit: number) {
        if (limit < 0) limit = 0;
        if (limit == 0) {
            this.clear();
        } else if (limit < this.size) {
            // chop off tail
            let t = this.size - limit;
            for (let i = 0; i < t; i++) {
                this.pop();
            }
        }
        this.limit = limit;
    }

    clear() {
        // Not clearing links should be safe, as long as user don't grab and hold node
        this.head = this.tail = undefined;
        this.size = 0;
        this._map.clear();
    }

    keys() {
        return new NodeIterator(this.head, (node) => node.key);
    }

    values() {
        return new NodeIterator(this.head, (node) => node.value);
    }

    entries() {
        return new NodeIterator(this.head, (node) => [node.key, node.value]);
    }

    [Symbol.iterator]() {
        return new NodeIterator(this.head, (node) => [node.key, node.value]);
    }

    forEach(func: (value: V, key: K, LRUMap: this) => any, thisObj?: any) {
        if (typeof thisObj !== 'object') {
            thisObj = this;
        }
        let node = this.head;
        while (node) {
            func.call(thisObj, node.value, node.key, this);
            node = node.next;
        }
    }

    toString() {
        let str = '';
        let node = this.head;
        while (node) {
            str += String(node.key) + ':' + node.value;
            node = node.next;
            if (node) {
                str += ' > ';
            }
        }
        return str;
    }
}

class Node<K, V> {
    key: K;
    value: V;
    prev?: Node<K, V>;
    next?: Node<K, V>;
    constructor(key: K, value: V) {
        this.key = key;
        this.value = value;
    }
}

class NodeIterator<K, V, R> implements Iterator<R> {
    private node?: Node<K, V>;
    private valueWrapper: (node: Node<K, V>) => R;
    constructor(node: Node<K, V> | undefined, valueWrapper: (node: Node<K, V>) => R) {
        this.node = node;
        this.valueWrapper = valueWrapper;
    }
    next(): IteratorResult<R> {
        const node = this.node;
        if (node) {
            this.node = node.next;
            return { done: false, value: this.valueWrapper(node) };
        } else {
            return { done: true, value: undefined };
        }
    }
    [Symbol.iterator]() {
        return this;
    }
}
