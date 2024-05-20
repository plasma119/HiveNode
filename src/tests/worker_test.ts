import { sleep } from '../lib/lib.js';
import DataIO from '../network/dataIO.js';
import {  HIVENETPORT, HiveNetPacket } from '../network/hiveNet.js';
import HiveNetInterface from '../network/interface.js';
import { getLoader } from '../os/loader.js';
import HiveOS from '../os/os.js';
import { CreateNewProcess } from '../os/worker.js';

export async function main(os: HiveOS, _argv: string[]) {
    const loader = getLoader();
    const log = (data: any) => {
        if (typeof data == 'string') {
            os.stdIO.output('[worker]: ' + data);
        } else {
            os.stdIO.output('[worker]: ');
            os.stdIO.output(data);
        }
    };
    if (loader && loader.type == 'os') {
        {
            let { infoIO, dataIO } = CreateNewProcess({
                workerFile: `dist/tests/worker_test.js`,
                argv: ['basic'],
            });
            infoIO.on('output', log);
            dataIO.on('output', log);
            await sleep(2000);
            dataIO.input('from parent');
        }
        await sleep(2000);
        {
            let { infoIO, dataIO, wrapper } = CreateNewProcess({
                workerFile: `dist/tests/worker_test.js`,
                hiveOS: true,
                argv: ['hiveOS'],
            });
            infoIO.on('output', log);
            dataIO.on('output', log);
            wrapper.on('configReady', () => os.stdIO.output('configReady Event'));
            wrapper.on('ready', () => os.stdIO.output('ready Event'));
            wrapper.exposeToHiveOS(os.netInterface);
            // DataIO.debugMode();
            await sleep(2000);
            dataIO.input('from parent');
        }
    }
}

export async function worker(dataIO: DataIO, argv: string[], netInterface: HiveNetInterface) {
    console.log(`console log test`);
    dataIO.input(`dataIO test`);
    dataIO.input(`argv: [${argv.join(', ')}]`);
    dataIO.on('output', (data) => {
        dataIO.input(`worker recieved: `);
        dataIO.input(data instanceof HiveNetPacket ? `HiveNetPacket: ${data.data}` : data);
    });
    if (netInterface) {
        dataIO.input(`net interface detected`);
        // DataIO.debugMode();
        let data = await netInterface.HTP.sendAndReceiveOnce('kernel status', '', HIVENETPORT.SHELL);
        console.log(data.data);
    }
}
