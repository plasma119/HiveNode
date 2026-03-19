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
    _head?: Node<K, V>; // newest node
    _tail?: Node<K, V>; // oldest node

    constructor(limit?: number, from?: Iterable<[K, V]>) {
        this.limit = typeof limit == 'number' ? limit : Infinity;
        if (this.limit < 0) this.limit = 0;
        if (from) {
            if (limit === undefined) this.limit = Infinity;
            this.assign(from);
            if (limit === undefined) this.limit = this.size;
        }
    }

    _getNode(key: K) {
        const node = this._map.get(key);
        if (!node) return;
        if (node === this._head) return node;
        // update most recently used node
        if (node.prev) {
            if (node === this._tail) this._tail = node.prev;
            node.prev.next = node.next;
        }
        if (node.next) {
            node.next.prev = node.prev;
        }
        node.prev = undefined;
        node.next = this._head;
        if (this._head) {
            this._head.prev = node;
        }
        this._head = node;
        return node;
    }

    assign(from: Iterable<[K, V]>) {
        if (this.limit == 0) return this;
        for (let [key, value] of from) {
            this.set(key, value);
        }
        return this;
    }

    get(key: K) {
        const node = this._getNode(key);
        if (node) return node.value;
        return;
    }

    set(key: K, value: V) {
        if (this.limit == 0) return this;
        let node = this._getNode(key);
        if (node) {
            // cached
            node.value = value;
            return this;
        }

        // new node
        node = new Node(key, value);
        this._map.set(key, node);
        if (this._head) {
            node.next = this._head;
            this._head.prev = node;
        }
        if (!this._tail) {
            this._tail = node;
        }
        this._head = node;

        ++this.size;
        if (this.size > this.limit) {
            this.pop();
        }

        return this;
    }

    pop() {
        const node = this._tail;
        if (node) {
            if (node.prev) {
                node.prev.next = undefined;
                this._tail = node.prev;
            } else {
                // last node in list
                this._head = undefined;
                this._tail = undefined;
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
            this._tail = node.prev;
        } else if (node.next) {
            // node is head
            node.next.prev = undefined;
            this._head = node.next;
        } else {
            // single node
            this._tail = this._head = undefined;
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
        this._head = this._tail = undefined;
        this.size = 0;
        this._map.clear();
    }

    keys() {
        return new NodeIterator(this._head, (node) => node.key);
    }

    values() {
        return new NodeIterator(this._head, (node) => node.value);
    }

    entries() {
        return new NodeIterator(this._head, (node) => [node.key, node.value]);
    }

    [Symbol.iterator]() {
        return new NodeIterator(this._head, (node) => [node.key, node.value]);
    }

    forEach(func: (value: V, key: K, LRUMap: this) => any, thisObj?: any) {
        if (typeof thisObj !== 'object') {
            thisObj = this;
        }
        let node = this._head;
        while (node) {
            func.call(thisObj, node.value, node.key, this);
            node = node.next;
        }
    }

    toString() {
        let str = '';
        let node = this._head;
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
