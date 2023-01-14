import HiveCommand from '../lib/hiveCommand.js';
import DataIO from '../network/dataIO.js';
import { sleep } from '../lib/lib.js';

let program = new HiveCommand();
let io = new DataIO({}, 'io');
io.connect(program.stdIO);
io.on('input', (data) => {
    if (data instanceof Error) {
        console.log(data.message);
    } else {
        console.log(data);
    }
});
let log = (args: any, opts: any) => {
    console.log(args);
    console.log(opts);
};

program.addNewCommand('test1', 'simple argument').addNewArgument('<url>').setAction(log);

program
    .addNewCommand('test2', 'argument, options')
    .addNewArgument('<arg1>', 'important')
    .addNewArgument('[arg2]', 'forgot')
    .addNewOption('-o')
    .addNewOption('-d [data]', 'stuff')
    .addNewOption('-req <input>')
    .setAction(log);

program
    .addNewCommand('test3', 'sub-command')
    .addNewArgument('[arg1]')
    .addNewOption('-q [never]', 'gonna', 'rick-rolled')
    .addNewOption('-r <give>')
    .addNewOption('-s [you]', 'up')
    .setAction(log)
    .addNewCommand('sub-cmd-test')
    .addNewArgument('[never]', 'gonna')
    .addNewArgument('[let]', 'you')
    .addNewOption('-down')
    .setAction(log);

program.addNewCommand('test4', 'return value').setAction(() => {
    return 'test string';
});

program.addNewCommand('test5', 'return promise').setAction(() => {
    return new Promise(async (resolve) => {
        await sleep(1000);
        resolve('nap time over');
    });
});

let program2 = HiveCommand.fromImport(program.export());

let list = [
    'testInvalid',

    'help',
    'help test2',
    'help test3',
    'help test4',

    'test1 help',
    'test1',
    'test1 http://www.google.com',
    'test1 123 456 789',
    'test1 "asd 123" foo',

    'test2 help',
    'test2',
    'test2 123',
    'test2 !@#$%^&*() a2',
    'test2 aaa -o',
    'test2 bbb -d',
    'test2 ccc -d opt haha',
    'test2 ddd -req',

    'test3 help',
    'test3 sub-cmd-test help',
    'test3',
    'test3 -r',
    'test3 -r www',

    'test4 help',
    'test4',

    'test5',
];

(async () => {
    for (let i = 0; i < list.length; i++) {
        try {
            console.log(list[i]);
            io.output(list[i]);
            await sleep(100);
        } catch (e) {
            if (e instanceof Error) {
                console.log(e.message);
            } else {
                console.log(e);
            }
        }
    }

    io.disconnect(program.stdIO);
    io.connect(program2.stdIO);

    for (let i = 0; i < list.length; i++) {
        try {
            console.log(list[i]);
            io.output(list[i]);
            await sleep(100);
        } catch (e) {
            if (e instanceof Error) {
                console.log(e.message);
            } else {
                console.log(e);
            }
        }
    }

})();
