import HiveComponent from '../lib/component.js';
import DataIO from '../network/dataIO.js';
import { DataParsing, DataSerialize, DataSignature } from '../network/hiveNet.js';
import { BootConfig } from './bios.js';
import { WorkerData, WorkerConfig } from './worker.js';
import { getLoader, resolveFileImport, setLoader } from './loader.js';
import { sleep } from '../lib/lib.js';
import HiveNetInterface from '../network/interface.js';

const component = new HiveComponent('Worker Loader');
const dataIO = new DataIO(component, 'dataIO');
dataIO.on(
    'input',
    (data, signatures) => {
        send({
            header: 'data',
            data: DataSerialize(data, signatures),
        });
    },
    'to parent process'
);

let booted = false;
let waitHiveOS = false;
let bootConfig: BootConfig | null = null;
let workerConfig: WorkerConfig | null = null;

// main function
(async () => {
    send({
        header: 'requestConfig',
    });
    await sleep(3000);
    if (!booted) {
        // request config failed, this will lead to worker sleeping without executing main script
        send({
            header: 'requestConfig',
        });
        await sleep(3000);
        if (!booted) throw new Error(`Failed to get worker config.`);
    }
})();

process.on('message', (message) => {
    try {
        const data: WorkerData = message as WorkerData;
        switch (data.header) {
            case 'config':
                if (booted) return;
                bootConfig = data.bootConfig;
                workerConfig = data.workerConfig;
                waitHiveOS = workerConfig.hiveOS || false;
                if (getLoader()) throw new Error(`Loader already set!`);
                setLoader({
                    type: 'workerProcess',
                    bootConfig,
                    workerConfig,
                });
                if (!waitHiveOS) bootWorker(workerConfig);
                break;
            case 'data':
                // TODO: maybe add stamp here?
                let signatures: DataSignature[] = [];
                let parsed = DataParsing(data.data, signatures);
                dataIO.output(parsed, signatures);
                break;
            case 'HiveOS':
                if (!workerConfig) throw new Error(`Worker config not set before HiveOS connection!`);
                bootWorker(workerConfig);
                break;
        }
    } catch (e) {}
});

// app should use DataIO instead
export function send(data: WorkerData) {
    if (!process.send) throw new Error(`Process send failed!`);
    process.send(data);
}

async function bootWorker(workerConfig: WorkerConfig) {
    if (booted) return;
    booted = true;
    let program = await import(resolveFileImport(import.meta.url, workerConfig.workerFile));

    if (workerConfig.hiveOS) {
        let netInterface = new HiveNetInterface('worker');
        netInterface.connect(dataIO, 'net');
        netInterface.setNATMode(true);
        program.worker(dataIO, workerConfig.argv, netInterface);
    } else {
        program.worker(dataIO, workerConfig.argv);
    }
}
