import HiveCommand from '../../lib/hiveCommand.js';
import { sleep, format } from '../../lib/lib.js';
import { DataSignaturesToString, HIVENETADDRESS, HiveNetPacket, HIVENETPORT } from '../../network/hiveNet.js';
import HiveNetNode from '../../network/node.js';
import HiveApp from '../app.js';

export default class HiveAppView extends HiveApp {
    constructor(node: HiveNetNode) {
        super(node, 'net-view');
    }

    initProgram(baseProgram: HiveCommand) {
        baseProgram.addNewCommand('view', 'Display current connected network nodes').setAction(() => this.netview());
    }

    async netview() {
        let list: string[][] = [];
        let t = Date.now();
        let port = this.node.HTP.listen(this.node.netInterface.newRandomPortNumber(), (packet, signatures) => {
            list.push([packet.src + ':', `${Date.now() - t}ms`, DataSignaturesToString(signatures)]);
        });
        port.input(new HiveNetPacket({ data: t, dest: HIVENETADDRESS.BROADCAST, dport: HIVENETPORT.PING, flags: { ping: true } }));
        await sleep(3000);
        return format(list, ' ');
    }
}
