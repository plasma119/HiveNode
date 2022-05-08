import { DataPacket, Router } from '../lib/router.js';
import DataIO, { DataSignature, DataSignaturesToString } from '../lib/dataIO.js';
import { sleep } from '../lib/lib.js';

function log(data: any, signatures: DataSignature[]) {
    console.log(data);
    if (data instanceof DataPacket) console.log(data.data);
    console.log(DataSignaturesToString(signatures));
    let t = signatures[signatures.length - 1].timestamp - signatures[0].timestamp;
    console.log(`${t} ms timestamp\n`);
}

function newTestIO(label: string) {
    let io = new DataIO({}, label);
    io.on('input', (data, signatures) => {
        if (data instanceof DataPacket) {
            if (data.flags.map && data.flags.request) {
                let p = new DataPacket(io.UUID, io.UUID, data.src);
                p.flags.map = true;
                io.output(p);
                return;
            } else if (data.flags.map) {
                // @ts-ignore
                console.log(`Router${signatures[0].by.name} map broadcast`);
                console.log(data);
                return;
            }
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

function ping(io: DataIO, dest: string) {
    let p = new DataPacket('', io.UUID, dest);
    p.flags.ping = true;
    io.output(p);
}

(async () => {
    {
        let routerA = new Router('A');
        let routerB = new Router('B');
        let routerC = new Router('C');

        let IOs = getIOs(10);
        routerA.connect(IOs[0]);
        routerA.connect(IOs[1]);
        routerA.connect(IOs[2]);
        routerB.connect(IOs[3]);
        routerB.connect(IOs[4]);
        routerB.connect(IOs[5]);
        routerC.connect(IOs[6]);
        routerC.connect(IOs[7]);

        routerA.connect(routerB);
        routerB.connect(routerC);

        await sleep(1000);

        ping(IOs[0], routerA.UUID);
        ping(IOs[0], routerB.UUID);
        ping(IOs[0], routerC.UUID);
        let test = (a: number, b: number) => IOs[a].output(new DataPacket(`io${a} to io${b}`, IOs[a].UUID, IOs[b].UUID));
        for (let i = 0; i < 8; i++) {
            test(0, i);
        }
    }
})();
