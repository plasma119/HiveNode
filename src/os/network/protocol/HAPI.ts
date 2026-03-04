/**
 * HAPI protocol
 *
 * TODO:
 * to define how to package data between programs and terminal controller
 * maybe inter-programs too?
 *
 */

import { uuidv7 } from '../../../lib/lib.js';
import HiveComponent from '../../lib/hiveComponent.js';

export type HAPIRequest = {
    _type: 'HAPIRequest';
    taskUUID: string;
    type: 'cmd' | 'completer' | 'taskkill';
    body: any;
    respondType: 'raw' | 'capsule' | 'void';
    progressType: 'raw' | 'capsule' | 'void';
};

export type HAPIRespond = {
    _type: 'HAPIRespond';
    taskUUID: string;
    type: 'cmd' | 'completer' | 'progress';
    body: any;
};

export type HAPIEvent = {
    newTask: (task: HAPITask) => void;
    closeTask: (task: HAPITask) => void;
    requestCmd: (task: HAPITask) => void;
    requestCompleter: (task: HAPITask) => void;
    requestTaskkill: (task: HAPITask) => void;
    taskkill: (taskUUID: string, callback: () => void) => void;
};

export default class HAPI extends HiveComponent<HAPIEvent> {
    tasks: Map<string, HAPITask> = new Map();

    constructor() {
        super('HAPI');
    }

    newRequest(
        body: any,
        type: 'cmd' | 'completer' | 'taskkill' = 'cmd',
        respondType: 'raw' | 'capsule' | 'void' = 'capsule',
        progressType: 'raw' | 'capsule' | 'void' = 'void',
    ): HAPIRequest {
        return {
            _type: 'HAPIRequest',
            taskUUID: uuidv7(),
            type,
            body,
            respondType,
            progressType,
        };
    }

    newTask(request: HAPIRequest | any, reply: (data: any) => void): HAPITask {
        const task = new HAPITask(this, request, reply);
        this.tasks.set(task.request.taskUUID, task);
        this.emit('newTask', task);
        return task;
    }

    closeTask(task: HAPITask) {
        this.tasks.delete(task.request.taskUUID);
        this.emit('closeTask', task);
    }
}

let nextTaskID = 1;

export class HAPITask extends HiveComponent {
    HAPI: HAPI;
    request: HAPIRequest;

    taskID: number = nextTaskID++;
    private _reply: (data: any) => void;

    constructor(HAPI: HAPI, request: HAPIRequest | any, reply: (data: any) => void) {
        super('HAPITask');
        this.HAPI = HAPI;

        if (typeof request == 'object' && request._type == 'HAPIRequest') {
            this.request = request;
        } else {
            this.request = {
                _type: 'HAPIRequest',
                taskUUID: uuidv7(),
                type: 'cmd',
                body: request,
                respondType: 'raw',
                progressType: 'void',
            };
        }
        this._reply = reply;

        if (this.request.type == 'cmd') HAPI.emit('requestCmd', this);
        if (this.request.type == 'completer') HAPI.emit('requestCompleter', this);
        if (this.request.type == 'taskkill') HAPI.emit('requestTaskkill', this);
    }

    reply(data: any) {
        if (this.request.respondType == 'raw') return this._reply(data);
        if (this.request.respondType == 'capsule') {
            this._reply({
                _type: 'HAPIRespond',
                taskUUID: this.request.taskUUID,
                type: this.request.type,
                body: data,
            });
        }
    }

    progress(data: any) {
        if (this.request.progressType == 'raw') return this._reply(data);
        if (this.request.progressType == 'capsule') {
            this._reply({
                _type: 'HAPIRespond',
                taskUUID: this.request.taskUUID,
                type: 'progress',
                body: data,
            });
        }
    }

    taskkill() {
        throw new Error('Taskkill');
    }
}
