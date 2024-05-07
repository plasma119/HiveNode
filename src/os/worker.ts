import * as fs from 'fs';
import { fork } from 'child_process';
import path from 'path';

import DataIO from '../network/dataIO.js';
import HiveComponent from '../lib/component.js';
import { DataParsing, DataSerialize, DataSignature } from '../network/hiveNet.js';
import { BootConfig } from './bios.js';
import { getLoader } from './loader.js';

// TODO: make this into HiveProcess
// need to keep standalone version for worker to spawn worker
const component = new HiveComponent('Worker Daemon');
let workerCount = 0;

export function CreateNewWorker() {
    // TODO
}

export type WorkerConfig = {
    workerFile: string;
    argv: string[];
    depth?: number;
};

export type WorkerData =
    | {
          header: 'data';
          data: string;
      }
    | {
          header: 'info';
          data: string;
      }
    | {
          header: 'requestConfig';
      }
    | {
          header: 'config';
          bootConfig: BootConfig;
          workerConfig: WorkerConfig;
      };

export function CreateNewProcess(workerConfig: WorkerConfig) {
    if (!fs.existsSync(workerConfig.workerFile)) throw new Error(`[Worker]: Cannot find worker file ${workerConfig.workerFile}`);

    const loder = getLoader();
    const bootConfig = loder?.bootConfig;
    if (!bootConfig) throw new Error(`[Worker]: Failed to get boot config!`);

    workerConfig.depth = 1;
    if (loder.type == 'workerProcess' && loder.workerConfig.depth) workerConfig.depth = loder.workerConfig.depth + 1;

    if (workerCount > 100) throw new Error(`[Worker]: Active worker count > 100!`);
    if (workerConfig.depth > 10) throw new Error(`[Worker]: Worker depth > 10!`);

    const infoIO = new DataIO(component, 'infoIO');
    const dataIO = new DataIO(component, 'dataIO');

    function workerExit() {
        infoIO.destroy();
        dataIO.destroy();
        workerCount--;
    }

    const worker = fork(path.join(bootConfig.HiveNodePath, '/os/workerProcessLoader.js'), {
        stdio: [
            /* Standard: stdin, stdout, stderr */
            'pipe',
            'pipe',
            'pipe',
            'ipc',
        ],
    });
    if (!worker.stdout || !worker.stderr || !worker.stdin) throw new Error(`[Worker]: std init error`);
    workerCount++;

    worker.stdout.on('data', (chunk: Buffer) => dataIO.output(chunk.toString('utf-8')));
    worker.stderr.on('data', (chunk: Buffer) => dataIO.output(chunk.toString('utf-8')));

    function workerSend(data: WorkerData) {
        worker.send(data);
    }

    worker.on('close', () => {
        infoIO.output('Worker exited.');
        workerExit();
    });
    worker.on('error', (e) => {
        infoIO.output(e);
    });
    worker.on('spawn', () => {
        infoIO.output('Worker booting up...');
    });
    worker.on('message', (message) => {
        try {
            const data: WorkerData = message as WorkerData;
            switch (data.header) {
                case 'requestConfig':
                    // TODO: set worker ready state, return event
                    workerSend({ header: 'config', bootConfig, workerConfig });
                    break;
                case 'data':
                    let signatures: DataSignature[] = [];
                    let parsed = DataParsing(data.data, signatures);
                    dataIO.output(parsed, signatures);
                    break;
                case 'info':
                    infoIO.output(data.data);
                    break;
            }
        } catch (e) {
            infoIO.output(e);
        }
    });
    dataIO.on('input', (data, signatures) => {
        workerSend({
            header: 'data',
            data: DataSerialize(data, signatures),
        });
    });

    return {
        infoIO,
        dataIO,
        worker,
    };
}
