import { sleep } from '../lib/lib.js';
import DataIO from '../network/dataIO.js';
import { getLoader } from '../os/loader.js';
import HiveOS from '../os/os.js';
import { CreateNewProcess } from '../os/worker.js';

export function main(os: HiveOS, _argv: string[]) {
    const loader = getLoader();
    if (loader && loader.type == 'os') {
        let { infoIO, dataIO } = CreateNewProcess({
            workerFile: `dist/tests/worker_test.js`,
            argv: [],
        });
        infoIO.on('output', os.stdIO.outputBind);
        dataIO.on('output', os.stdIO.outputBind);
        sleep(2000).then(() => {
            dataIO.input('from parent');
        });
    }
}

export function worker(dataIO: DataIO, argv: string[]) {
    console.log(`console log test`);
    dataIO.input(`dataIO test`);
    dataIO.input(`argv: [${argv.join(', ')}]`);
    dataIO.on('output', (data) => dataIO.input(`worker recieved: ${data}`));
}
