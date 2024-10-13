import * as fs from 'fs';
import { fork, ChildProcess } from 'child_process';
import path from 'path';

import DataIO from '../network/dataIO.js';
import HiveComponent from '../lib/component.js';
import { DataParsing, DataSerialize, DataSignature } from '../network/hiveNet.js';
import { getLoader } from './loader.js';
import HiveNetInterface, { PortIO } from '../network/interface.js';
import { BootConfig } from './bootConfig.js';

// TODO: make this into HiveProcess
// !! do not import HiveOS here
// need to keep standalone version for worker to spawn worker

// TODO: method to connect worker to HiveOS:
// interface is standalone? attach HTP protocol and assign standard worker port in HiveNet

let workerCount = 0;

export type WorkerConfig = {
    workerFile: string;
    argv: string[];
    hiveOS?: boolean; // workerProcessLoader will wait for hiveOS connected before executing script
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
      }
    | {
          header: 'HiveOS';
      };

export function CreateNewWorkerThread() {
    // TODO
}

export function CreateNewProcess(workerConfig: WorkerConfig) {
    if (!fs.existsSync(workerConfig.workerFile)) throw new Error(`[Worker]: Cannot find worker file ${workerConfig.workerFile}`);

    const loder = getLoader();
    const bootConfig = loder?.bootConfig;
    if (!bootConfig) throw new Error(`[Worker]: Failed to get boot config!`);

    workerConfig.depth = 1;
    if (loder.type == 'workerProcess' && loder.workerConfig.depth) workerConfig.depth = loder.workerConfig.depth + 1;

    if (workerCount > 100) throw new Error(`[Worker]: Active worker count > 100!`);
    if (workerConfig.depth > 10) throw new Error(`[Worker]: Worker depth > 10!`);

    const worker = fork(path.join(bootConfig.HiveNodePath, '/os/workerProcessLoader.js'), {
        stdio: [
            /* Standard: stdin, stdout, stderr */
            'pipe',
            'pipe',
            'pipe',
            'ipc',
        ],
    });
    workerCount++;

    const wrapper = new workerWrapper('process', worker, workerConfig, bootConfig);
    const infoIO = wrapper.infoIO;
    const dataIO = wrapper.dataIO;

    return {
        infoIO,
        dataIO,
        worker,
        wrapper,
    };
}

type workerWrapperEvents = {
    ready: () => void;
    configReady: () => void;
    error: (e: Error) => void;
    exit: () => void;
};

export class workerWrapper extends HiveComponent<workerWrapperEvents> {
    infoIO: DataIO;
    dataIO: DataIO;

    worker?: ChildProcess;
    sendData = (_data: WorkerData) => {};
    configSet: boolean = false;
    ready: boolean = false;
    alive: boolean = true;

    workerConfig: WorkerConfig;
    bootConfig: BootConfig;

    portIO?: PortIO;

    constructor(type: 'workerThread' | 'process', worker: ChildProcess, workerConfig: WorkerConfig, bootConfig: BootConfig) {
        super('worker');
        // TODO: workerThread
        if (type == 'workerThread') throw new Error('workerThread WIP');

        this.infoIO = new DataIO(this, 'infoIO');
        this.dataIO = new DataIO(this, 'dataIO');
        this.workerConfig = workerConfig;
        this.bootConfig = bootConfig;

        if (type == 'process') {
            this.worker = worker;

            if (!worker.stdout || !worker.stderr || !worker.stdin) throw new Error(`[Worker]: std init error`);
            worker.stdout.on('data', (chunk: Buffer) => this.dataIO.output(chunk.toString('utf-8')));
            worker.stderr.on('data', (chunk: Buffer) => this.dataIO.output(chunk.toString('utf-8')));

            this.sendData = (data: WorkerData) => worker.send(data);

            worker.on('exit', () => {
                this.alive = false;
                this.infoIO.output('Worker exited.');
                this.emit('exit');
                this.infoIO.destroy();
                this.dataIO.destroy();
                workerCount--;
            });
            worker.on('error', (e) => {
                this.alive = false;
                this.emit('error', e);
                this.infoIO.output(e);
            });
            worker.on('spawn', () => {
                this.infoIO.output('Worker booting up...');
            });
            worker.on('message', (message) => {
                try {
                    const data: WorkerData = message as WorkerData;
                    switch (data.header) {
                        case 'requestConfig':
                            // TODO: set worker ready state, return event
                            this.sendData({ header: 'config', bootConfig, workerConfig });
                            this.configSet = true;
                            this.emit('configReady');
                            if (workerConfig.hiveOS) break;
                            this.ready = true;
                            this.emit('ready');
                            break;
                        case 'data':
                            let signatures: DataSignature[] = [];
                            let parsed = DataParsing(data.data, signatures);
                            this.dataIO.output(parsed, signatures);
                            break;
                        case 'info':
                            this.infoIO.output(data.data);
                            break;
                    }
                } catch (e) {
                    this.infoIO.output(e);
                }
            });
            this.dataIO.on(
                'input',
                (data, signatures) => {
                    this.sendData({
                        header: 'data',
                        data: DataSerialize(data, signatures),
                    });
                },
                'to worker'
            );
        }
    }

    exposeToHiveOS(netInterface: HiveNetInterface) {
        if (this.configSet) {
            this._exposeToHiveOSCallback(netInterface);
        } else {
            this.once('configReady', () => this._exposeToHiveOSCallback(netInterface));
        }
    }

    _exposeToHiveOSCallback(netInterface: HiveNetInterface) {
        this.portIO = netInterface.newRandomIO(this);
        this.portIO.connect(this.dataIO);
        // TODO: inject HiveOS interface UUID to worker?
        this.sendData({
            header: 'HiveOS',
        });
        if (!this.workerConfig.hiveOS) return;
        this.ready = true;
        this.emit('ready');
    }
}
