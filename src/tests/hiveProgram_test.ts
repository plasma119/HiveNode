
import HiveProgram from '../lib/hiveProgram.js';
import DataIO from '../lib/dataIO.js';

let program = new HiveProgram();
let io = new DataIO({}, 'io');
io.connect(program.stdIO);
io.on('input', (data) => console.log(data));
let log = (args: any, opts: any) => {
    console.log(args);
    console.log(opts);
};

program.addNewCommand('test1')
    .addNewArgument('<url>')
    .setAction(log);

program.addNewCommand('test2', 'doing something')
    .addNewArgument('<arg1>', 'important')
    .addNewArgument('[arg2]', 'forgot')
    .addNewOption('-f')
    .addNewOption('-d [data]', 'stuff')
    .setAction(log);

program.addNewCommand('test3')
    .addNewOption('-q [never]', 'gonna', 'rick-rolled')
    .addNewOption('-r <give>')
    .addNewOption('-s [you]', 'up')
    .setAction(log)
    .addNewCommand('sub-cmd-test')
    .addNewArgument('[never]', 'gonna')
    .addNewArgument('[let]', 'you')
    .addNewOption('-down')
    .setAction(log);

let list = [
    'testInvalid',
    'test1 http://www.google.com',
    'test1 123 456 789',
    'test1',
    'test2 -f testing rrr',
    'test2 -d -f 123',
    'test2 -d lol asdf -f',
    'test2 aaa -d',
    'test3 -r',
    'test3 -r s',
    'help',
    'help test2',
    'help test3',
    'test3 help',
    'test3 sub-cmd-test help',
]

for (let i = 0; i < list.length; i++) {
    try {
        console.log(list[i]);
        io.output(list[i]);
    } catch (e) {
        if (e instanceof Error) {
            console.log(e.message)
        } else {
            console.log(e);
        }
    }
}



