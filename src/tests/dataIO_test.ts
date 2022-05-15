import DataIO, { DataSignature, DataSignaturesToString } from '../network/dataIO.js';

function log(data: any, signatures: DataSignature[]) {
    console.log(data);
    console.log(DataSignaturesToString(signatures));
    let t = signatures[signatures.length - 1].timestamp - signatures[0].timestamp;
    console.log(`${t} ms timestamp\n`);
};

function newTestIO(label: string) {
    let io = new DataIO({}, label);
    io.on('input', log);
    return io;
}

function getIOs(n: number) {
    let IOs: DataIO[] = [];
    for (let i = 0; i < n; i++) IOs[i] = newTestIO(`io${i}`);
    return IOs;
}

function connect(io1: DataIO, io2: DataIO) {
    io1.connect(io2);
    console.log(`${io1.label} <-> ${io2.label}`);
}

function passThrough(io1: DataIO, io2: DataIO) {
    io1.passThrough(io2);
    console.log(`${io1.label} == ${io2.label}`);
}

{
    // test 1
    console.log('\ntest 1:\n');
    let IOs = getIOs(10);
    connect(IOs[0], IOs[1]);
    connect(IOs[0], IOs[4]);
    connect(IOs[4], IOs[6]);
    connect(IOs[6], IOs[7]);
    IOs[0].output('test 1');
}

{
    // test 2
    console.log('\ntest 2:\n');
    let IOs = getIOs(10);
    connect(IOs[0], IOs[1]);
    passThrough(IOs[1], IOs[2]);
    passThrough(IOs[2], IOs[3]);
    connect(IOs[3], IOs[4]);
    IOs[0].output('test 2');
}
