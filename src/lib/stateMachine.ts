import BasicEventEmitter from './basicEventEmitter.js';
import { CircularBuffer } from './circularBuffer.js';

export type StateMachineAction<states extends string> = (state: states, prev: states) => states | void | Promise<states | void>;
export type StateMachineNode<states extends string> = Record<states, StateMachineAction<states> | undefined>;
export type StateMachineDiagram<states extends string> = Record<states, StateMachineNode<states>>;

type StateMachineEvent<states extends string> = {
    stateChange: (current: states, prev: states) => void;
    undefinedPath: (current: states, prev: states) => void; // throw error if no listener
    undefinedNext: (current: states, prev: states) => void; // throw error if no listener
    end: (current: states, prev: states) => void;
};

export default class StateMachine<states extends string> extends BasicEventEmitter<StateMachineEvent<states>> {
    diagram: StateMachineDiagram<states>;

    state: states;
    prevState: states;
    history: CircularBuffer<states> = new CircularBuffer(1000); // for debugging purpose

    endState: states | null;

    infiniteLoopDetection: boolean = true; // prevent superfast infinite loop
    private _loop: number = 0;
    private _timestamp: number = Date.now();

    constructor() {
        super();
        this.diagram = {} as StateMachineDiagram<states>;
        this.state = 'START' as states;
        this.prevState = 'START' as states;
        this.endState = null;
        this.history.push(this.state);
    }

    addPath(from: states, to: states, func: StateMachineAction<states>) {
        let node = this.diagram[from];
        if (!node) {
            node = {} as StateMachineNode<states>;
            this.diagram[from] = node;
        }
        node[to] = func;
    }

    addPathTo(to: states, func: StateMachineAction<states>) {
        for (let state in this.diagram) {
            const node = this.diagram[state];
            node[to] = func;
        }
    }

    addPathFrom(from: states, func: StateMachineAction<states>) {
        let node = this.diagram[from];
        if (!node) {
            node = {} as StateMachineNode<states>;
            this.diagram[from] = node;
        }
        for (let state in this.diagram) {
            node[state] = func;
        }
    }

    deletePath(from: states, to: states) {
        let node = this.diagram[from];
        if (!node) return;
        node[to] = undefined;
    }

    setEndState(endState: states) {
        this.endState = endState;
    }

    // always start from state [START]
    async setState(next: states): Promise<void> {
        // infinite loop detection
        if (this.infiniteLoopDetection) {
            if (this._timestamp + 1000 < Date.now()) {
                this._timestamp = Date.now();
                this._loop = 0;
            } else if (this._loop++ > 1000) {
                throw new Error('State Machine: Infinite loop detected!');
            }
        }

        // get path
        const node = this.diagram[this.state];
        const func = node[next];
        if (!func) {
            let c = this.getListenerCount('undefinedPath');
            if (c < 1) throw new Error(`State Machine: Undefined path: [${this.state}]->[${next}]`);
            this.emit('undefinedPath', next, this.state);
            return;
        }

        // state change
        this.prevState = this.state;
        this.state = next;
        this.history.push(next);
        this.emit('stateChange', this.state, this.prevState);

        // execute state change action
        let result = func(this.state, this.prevState);

        // get next state
        if (typeof result != 'string' && typeof result?.then == 'function') result = await result;
        if (typeof result === 'string') return this.setState(result);

        // end state
        if (this.state === this.endState) {
            this.emit('end', this.state, this.prevState);
            return;
        }

        let c = this.getListenerCount('undefinedNext');
        if (c < 1) throw new Error(`State Machine: undefined next state: [${this.prevState}]->[${this.state}]`);
        this.emit('undefinedNext', this.state, this.prevState);
    }
}
