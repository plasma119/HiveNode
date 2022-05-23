import HiveNetSwitch from '../network/switch.js';
import DataIO from '../network/dataIO.js';
import { DataSignature, HiveNetFrame, DataSignaturesToString, HIVENETBROADCASTADDRESS } from '../network/hiveNet.js';

function log(data: any, signatures: DataSignature[]) {
    console.log(data);
    if (data instanceof HiveNetFrame) console.log(data.data);
    console.log(DataSignaturesToString(signatures));
    let t = signatures[signatures.length - 1].timestamp - signatures[0].timestamp;
    console.log(`${t} ms timestamp\n`);
}

function newTestIO(label: string) {
    let io = new DataIO({}, label);
    io.on('input', (data, signatures) => {
        if (data instanceof HiveNetFrame && (data.dest == io.UUID || data.dest == HIVENETBROADCASTADDRESS) && data.flags.ping) {
            io.output(new HiveNetFrame('pong', io.UUID, data.src, {pong: true}))
        }
        log(data, signatures);
    });
    return io;
}

function getIOs(n: number) {
    let IOs: DataIO[] = [];
    for (let i = 0; i < n; i++) IOs[i] = newTestIO(`io${i}`);
    return IOs;
}

function ping(io: DataIO, dest: string, data = '') {
    let p = new HiveNetFrame(data, io.UUID, dest);
    p.flags.ping = true;
    io.output(p);
}

(async () => {
    {
        let switchA = new HiveNetSwitch('A');
        let switchB = new HiveNetSwitch('B');
        let switchC = new HiveNetSwitch('C');

        let IOs = getIOs(10);
        switchA.connect(IOs[0]);
        switchA.connect(IOs[1]);
        switchA.connect(IOs[2]);
        switchB.connect(IOs[3]);
        switchB.connect(IOs[4]);
        switchB.connect(IOs[5]);
        switchC.connect(IOs[6]);
        switchC.connect(IOs[7]);

        switchA.connect(switchB);
        switchB.connect(switchC);

        let test = (a: number, b: number) => IOs[a].output(new HiveNetFrame(`io${a} to io${b}`, IOs[a].UUID, IOs[b].UUID));
        let testping = (a: number, b: number) => IOs[a].output(new HiveNetFrame(`io${a} ping io${b}`, IOs[a].UUID, IOs[b].UUID, {ping: true}));

        for (let i = 0; i < 8; i++) {
            testping(0, i);
        }
        console.log('testping completed.');

        switchB.disconnect(switchC);
        switchB.disconnect(IOs[4]);
        switchB.disconnect(IOs[5]);
        switchA.disconnect(IOs[2]);

        for (let i = 0; i < 8; i++) {
            test(0, i);
        }
        console.log('test completed.');

        ping(IOs[0], HIVENETBROADCASTADDRESS, 'broadcast');
        console.log('broadcast completed.');
    }
})();
