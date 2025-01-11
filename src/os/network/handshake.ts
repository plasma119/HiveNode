import { typeCheck } from '../../lib/lib.js';
import StateMachine, { StateMachineAction } from '../../lib/stateMachine.js';
import HiveComponent from '../lib/hiveComponent.js';

/*
START
set to state S1
generate initial packet if not cached
send packet
timeout -> state S1
receive packet -> state S2


state M
generate packet if not cached
send packet
timeout -> state M
out of retries -> state Error/Failed
error -> state Error
receive invalid packet -> state Invalid
receive 'ERROR/CLOSE/NO SHAKE' packet -> state NO SHAKE/Error
receive good packet -> state M2


need to make:
generate and cache outgoing packet
wrapper to send and receive packet
special node to handle error/invalid/no shake event

*/

type HandShakeMachineStates = 'START' | 'END' | 'ERROR';
type HandShakeStatus = 'INIT' | 'RUNNING' | 'OK' | 'ERROR' | 'TIMEOUT';

type HandShakeEvent<states extends string> = {
    // stateMachine events
    stateChange: (current: states, prev: states) => void;
    undefinedPath: (current: states, prev: states) => void; // throw error if no listener
    undefinedNext: (current: states, prev: states) => void; // throw error if no listener
    end: (current: states, prev: states) => void;
};

// boiler plates for handshake protocols using stateMachine
export default class HandShake<states extends string> extends HiveComponent<HandShakeEvent<states | HandShakeMachineStates>> {
    handShakeMachine: StateMachine<states | HandShakeMachineStates>;

    private _dataQueue: any[] = [];
    private _nextDataHandler?: (data: any) => void;

    timeout: number = 3000; // ms
    private _stateChanged: boolean = false;

    done: boolean = false;
    status: HandShakeStatus = 'INIT';
    message: string = '';
    error?: Error;

    constructor() {
        super('HandShake');
        const machine = new StateMachine<states | HandShakeMachineStates>();
        this.handShakeMachine = machine;
        machine.on('stateChange', (current, prev) => {
            this.logEvent(`[${prev}]->[${current}]`, 'state change', 'state machine');
            this._stateChanged = true;
            this.emit('stateChange', current, prev);
        });
        machine.on('undefinedPath', (current, prev) => {
            this.logEvent(`[${prev}]->[${current}]`, 'undefined path', 'state machine');
            this.emit('undefinedPath', current, prev);
        });
        machine.on('undefinedNext', (current, prev) => {
            this.logEvent(`[${prev}]->[${current}]`, 'undefined next state', 'state machine');
            this.emit('undefinedNext', current, prev);
        });
        machine.on('end', (current, prev) => {
            this.logEvent(`[${prev}]->[${current}]`, 'end', 'state machine');
            this.emit('end', current, prev);
        });
        machine.setEndState('END');
        this.handShakeMachine.addPath('ERROR', 'END', () => {});
    }

    addPath(from: states | HandShakeMachineStates, to: states | HandShakeMachineStates, func: StateMachineAction<states | HandShakeMachineStates>) {
        this.logEvent(`addPath [${from}] -> [${to}]`, 'init', 'handshake');
        this.handShakeMachine.addPath(from, to, (state, prev) => {
            try {
                const result = func(state, prev);
                return result;
            } catch (e) {
                this.error = e as Error;
                this.message = this.error.message;
                return 'ERROR';
            }
        });
        this.handShakeMachine.addPath(to, 'ERROR', this._errorStateHandler.bind(this));
    }

    getNextData(dataShape?: any): Promise<any> {
        this.logEvent(`wait for data`, 'getNextData', 'data');
        return new Promise((resolve) => {
            const func = (data: any) => {
                if (dataShape && !typeCheck(data, dataShape)) {
                    this.logEvent(`Data type check failed!`, 'getNextData', 'data');
                    return resolve(null);
                }
                this.logEvent(`got data`, 'getNextData', 'data');
                resolve(data);
            };
            const data = this._dataQueue.shift();
            if (data) return func(data);
            this._nextDataHandler = func;
        });
    }

    inputData(data: any) {
        this.logEvent(`input data`, 'inputData', 'data');
        if (this._nextDataHandler) return this._nextDataHandler(data);
        this._dataQueue.push(data);
    }

    start(state: states | HandShakeMachineStates): Promise<HandShakeStatus> {
        return new Promise((resolve) => {
            this.logEvent(`handshake start`, 'start', 'handshake');
            this.status = 'RUNNING';
            setTimeout(this._timeoutHandler.bind(this), this.timeout);
            this.handShakeMachine.setState(state);
            this.on('end', () => {
                if (this.status === 'RUNNING') this.status = 'OK';
                this.done = true;
                this.logEvent(`handshake done: [${this.status}]`, 'end', 'handshake');
                resolve(this.status);
            });
        });
    }

    private _timeoutHandler() {
        if (this.done) return;
        if (this._stateChanged) {
            this._stateChanged = false;
            setTimeout(this._timeoutHandler.bind(this), this.timeout);
        }
        this.logEvent(`handshake timeout`, 'timeout', 'handshake');
        this.status = 'TIMEOUT';
        this.message = 'TIMEOUT';
        this.handShakeMachine.setState('ERROR');
    }

    private _errorStateHandler(): states | HandShakeMachineStates {
        if (this.status === 'RUNNING') this.status = 'ERROR';
        return 'END';
    }
}
