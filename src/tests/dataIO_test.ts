
import DataIO, { DataSignature } from "../lib/dataIO.js";

type foo = {
    IOs: DataIO[]
}

let apple: foo = {
    IOs: []
};
let pear: foo = {
    IOs: []
};
let lemon: foo = {
    IOs: []
};

function log(info: string) {
    return (data: any, signatures: DataSignature[]) => {
        console.log(info);
        console.log(data);
        console.log(signatures.map(s => `id[${s.UID}]:${s.label}:${s.event}`));
        let t = signatures[signatures.length - 1].timestamp - signatures[0].timestamp;
        console.log(`${t} ms timestamp\n`);
    }
}

apple.IOs[0] = new DataIO(apple, 'apple_1');
apple.IOs[1] = new DataIO(apple, 'apple_2');
pear.IOs[0] = new DataIO(pear, 'pear_1');
apple.IOs[2] = new DataIO(apple, 'apple_3');
pear.IOs[1] = new DataIO(pear, 'pear_2');
pear.IOs[2] = new DataIO(pear, 'pear_3');
lemon.IOs[0] = new DataIO(pear, 'lemon_1');

apple.IOs[0].connect(pear.IOs[0]);
pear.IOs[0].on('input', log('apple 1 to pear 1'));
apple.IOs[0].connect(pear.IOs[2]);
pear.IOs[2].on('input', log('apple 1 to pear 3'));
apple.IOs[0].output('test 1');

apple.IOs[1].connect(pear.IOs[1]);
pear.IOs[1].passThrough(pear.IOs[2]);
pear.IOs[2].connect(lemon.IOs[0]);
lemon.IOs[0].on('input', log('apple 2 to pear 2 pass to pear 3 to lemon 1'));
apple.IOs[0].on('input', log('apple 2 to pear 2 pass to pear 3 to apple 1'));
apple.IOs[1].output('test 2');
