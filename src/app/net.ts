import hiveCommand from '../lib/hiveCommand.js';
import HiveNetNode from '../network/node.js';
import HiveApp from './app.js';
import HiveAppMessage from './net/message.js';
import HiveAppPing from './net/ping.js';
import HiveAppSSH from './net/ssh.js';
import HiveAppView from './net/view.js';

export default class HiveAppNet extends HiveApp {
    apps: HiveApp[] = [
        new HiveAppPing(this.node),
        new HiveAppView(this.node),
        new HiveAppMessage(this.node),
        new HiveAppSSH(this.node)
    ];

    constructor(node: HiveNetNode) {
        super(node, 'net');
    }

    initProgram(baseProgram: hiveCommand) {
        let net = baseProgram.addNewCommand('net', 'HiveNet commands');
        this.apps.forEach((app) => {
            app.initProgram(net);
        });
    }
}
