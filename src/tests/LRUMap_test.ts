import LRUMap from '../lib/LRUMap.js';

import { Test } from '../tool/testHelper.js';

export const test: Test = {
    testItems: [
        {
            name: 'set and get',
            testItem: (assert) => {
                let LRU = new LRUMap(4);
                assert(LRU.size);
                assert(LRU.limit);
                assert(LRU.head);
                assert(LRU.tail);

                LRU.set('adam', 29).set('john', 26).set('angela', 24).set('bob', 48);
                assert(LRU.toString());
                assert(LRU.size);

                assert(LRU.get('adam'));
                assert(LRU.get('john'));
                assert(LRU.get('angela'));
                assert(LRU.get('bob'));
                assert(LRU.toString());

                assert(LRU.get('angela'));
                assert(LRU.toString());

                LRU.set('ygwie', 81);
                assert(LRU.toString());
                assert(LRU.size);
                assert(LRU.get('adam'));

                LRU.set('john', 11);
                assert(LRU.toString());
                assert(LRU.get('john'));

                LRU.forEach(function (v, k) {
                    assert([v, k]);
                });

                // removing one item decrements size by one
                assert(LRU.size);
                LRU.delete('john');
                assert(LRU.size);
            },
        },

        {
            name: 'construct with iterator',
            testItem: (assert) => {
                let verifyEntries = function (LRU: LRUMap<string, number>) {
                    assert(LRU.size);
                    assert(LRU.limit);
                    assert(LRU.tail?.key);
                    assert(LRU.head?.key);
                    assert(LRU.get('adam'));
                    assert(LRU.get('john'));
                    assert(LRU.get('angela'));
                    assert(LRU.get('bob'));
                };

                // with explicit limit
                verifyEntries(
                    new LRUMap(4, [
                        ['adam', 29],
                        ['john', 26],
                        ['angela', 24],
                        ['bob', 48],
                    ])
                );

                // with inferred limit
                verifyEntries(
                    new LRUMap(undefined, [
                        ['adam', 29],
                        ['john', 26],
                        ['angela', 24],
                        ['bob', 48],
                    ])
                );
            },
        },

        {
            name: 'assign',
            testItem: (assert) => {
                let LRU = new LRUMap(undefined, [
                    ['adam', 29],
                    ['john', 26],
                    ['angela', 24],
                    ['bob', 48],
                ]);

                LRU.assign([
                    ['mimi', 1],
                    ['patrick', 2],
                    ['jane', 3],
                    ['fred', 4],
                ]);
                assert(LRU.size);
                assert(LRU.limit);
                assert(LRU.tail?.key);
                assert(LRU.head?.key);
                LRU.forEach(function (v, k) {
                    assert([v, k]);
                });

                // assigning too many items should throw away old items
                LRU.assign([
                    ['adam', 29],
                    ['john', 26],
                    ['angela', 24],
                    ['bob', 48],
                    ['ken', 30],
                ]);
                assert(LRU.size);
                assert(LRU.limit);

                // assigning less than limit should not affect limit or size
                LRU.assign([
                    ['adam', 29],
                    ['john', 26],
                    ['angela', 24],
                ]);
                assert(LRU.size);
                assert(LRU.limit);
            },
        },

        {
            name: 'delete',
            testItem: (assert) => {
                let LRU = new LRUMap(undefined, [
                    ['adam', 29],
                    ['john', 26],
                    ['angela', 24],
                    ['bob', 48],
                ]);
                assert(LRU.get('adam'));
                LRU.delete('adam');
                assert(LRU.size);
                assert(LRU.get('adam'));
                LRU.delete('angela');
                assert(LRU.size);
                LRU.delete('bob');
                assert(LRU.size);
                LRU.delete('john');
                assert(LRU.size);
                assert(LRU.get('john'));
                assert(LRU.tail?.key);
                assert(LRU.head?.key);
            },
        },

        {
            name: 'clear',
            testItem: (assert) => {
                let LRU = new LRUMap(4);
                LRU.set('adam', 29);
                LRU.set('john', 26);
                assert(LRU.size);
                LRU.clear();
                assert(LRU.size);
                assert(LRU.head);
                assert(LRU.tail);
            },
        },
        {
            name: 'pop',
            testItem: (assert) => {
                let LRU = new LRUMap(4);
                assert(LRU.size);
                LRU.set('a', 1);
                LRU.set('b', 2);
                LRU.set('c', 3);
                assert(LRU.size);

                let node = LRU.pop();
                assert(node);

                node = LRU.pop();
                assert(node);

                node = LRU.pop();
                assert(node);

                // c2 should be empty
                LRU.forEach(function (v, k) {
                    assert([v, k]);
                });
                assert(LRU.size);
            },
        },
        {
            name: 'set',
            testItem: (assert) => {
                let LRU = new LRUMap(4);
                LRU.set('a', 1);
                LRU.set('a', 2);
                LRU.set('a', 3);
                LRU.set('a', 4);
                assert(LRU.size);
                assert(LRU.head?.key);
                assert(LRU.head?.value);
                assert(LRU.tail?.key);
                assert(LRU.tail?.value);

                LRU.set('a', 5);
                assert(LRU.size);
                assert(LRU.head?.key);
                assert(LRU.head?.value);
                assert(LRU.tail?.key);
                assert(LRU.tail?.value);

                LRU.set('b', 6);
                assert(LRU.size);
                assert(LRU.head?.key);
                assert(LRU.head?.value);
                assert(LRU.tail?.key);
                assert(LRU.tail?.value);

                LRU.pop();
                assert(LRU.size);
                LRU.pop();
                assert(LRU.size);
                LRU.forEach(function (v, k) {
                    assert([v, k]);
                });
            },
        },

        {
            name: 'entry iterator',
            testItem: (assert) => {
                let LRU = new LRUMap(4, [
                    ['adam', 29],
                    ['john', 26],
                    ['angela', 24],
                    ['bob', 48],
                ]);

                let verifyEntries = function (iterable: Iterable<(string | number)[]>) {
                    assert(typeof iterable[Symbol.iterator]);
                    let it = iterable[Symbol.iterator]();
                    assert(it.next().value);
                    assert(it.next().value);
                    assert(it.next().value);
                    assert(it.next().value);
                    assert(it.next().done);
                };

                verifyEntries(LRU);
                verifyEntries(LRU.entries());
            },
        },

        {
            name: 'key iterator',
            testItem: (assert) => {
                let LRU = new LRUMap(4, [
                    ['adam', 29],
                    ['john', 26],
                    ['angela', 24],
                    ['bob', 48],
                ]);
                let it = LRU.keys();
                assert(it.next().value);
                assert(it.next().value);
                assert(it.next().value);
                assert(it.next().value);
                assert(it.next().done);
            },
        },

        {
            name: 'value iterator',
            testItem: (assert) => {
                let LRU = new LRUMap(4, [
                    ['adam', 29],
                    ['john', 26],
                    ['angela', 24],
                    ['bob', 48],
                ]);
                let it = LRU.values();
                assert(it.next().value);
                assert(it.next().value);
                assert(it.next().value);
                assert(it.next().value);
                assert(it.next().done);
            },
        },
    ],
};
