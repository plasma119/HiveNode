import HiveCommand from '../../lib/hiveCommand.js';
import { HIVENETPORT } from '../../network/hiveNet.js';
import HiveNetNode from '../../network/node.js';
import HiveApp from '../app.js';

export default class HiveAppMessage extends HiveApp {
    constructor(node: HiveNetNode) {
        super(node, 'message');
    }

    init() {
        this.node.HTP.listen(HIVENETPORT.MESSAGE, (packet, signatures) => {
            this.node.stdIO.output(packet.data, signatures);
        });
    }

    initProgram(baseProgram: HiveCommand) {
        baseProgram.addNewCommand('message', 'Message target node')
            .addNewArgument('<UUID>', 'target UUID')
            .addNewArgument('<text>', 'message to send')
            .setAction((args) => this.message(args['UUID'], args['text']));
    }
    
    message(dest: string, data: any) {
        this.node.HTP.send(data, dest, HIVENETPORT.MESSAGE);
    }
}