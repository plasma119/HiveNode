import HiveCommand from '../lib/hiveCommand.js';
import HiveNetNode from '../network/node.js';

interface HiveAppInterface {
    init(): void;
    initProgram(baseProgram: HiveCommand): void;
    exportProgram(): void;
}

export default class HiveApp implements HiveAppInterface {
    node: HiveNetNode;
    name: string;

    constructor(node: HiveNetNode, name: string) {
        this.node = node;
        this.name = name;
        node.apps.push(this);
        this.init();
    }

    init() {}

    initProgram(_baseProgram: HiveCommand) {}

    exportProgram() {
        // TODO
    }
}
