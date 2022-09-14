import HiveCommand from '../../lib/hiveCommand.js';
import { sleep, format } from '../../lib/lib.js';
import { DataSignaturesToString, HIVENETADDRESS, HiveNetPacket, HIVENETPORT } from '../../network/hiveNet.js';
import HiveNetNode from '../../network/node.js';
import HiveApp from '../app.js';
import HiveAppInfo from './info.js';

export default class HiveAppView extends HiveApp {
    constructor(node: HiveNetNode) {
        super(node, 'net-view');
    }

    initProgram(baseProgram: HiveCommand) {
        baseProgram.addNewCommand('view', 'Display current connected network nodes')
            .addNewOption('-detail', 'Display data signatures')
            .setAction((_, opts) => this.netview(!!opts['-detail']));
    }

    async netview(detail: boolean) {
        let list: string[][] = [];
        let t = Date.now();

        // try to get info app in wacky way
        let app = this.node.apps.get('info');
        let appInfo: HiveAppInfo | undefined = undefined;
        if (app instanceof HiveAppInfo) appInfo = app;

        let port = this.node.HTP.listen(this.node.netInterface.newRandomPortNumber(), async (packet, signatures) => {
            let info = appInfo? (await appInfo.getInfo(packet.src))?.info: undefined;
            let time = Date.now() - t;
            if (!info) info = {
                name: 'unknown',
                UUID: packet.src,
                type: 'unknown',
                HiveNodeVersion: 'unknown'
            }
            if (detail) { 
                list.push([`${info.name}[${packet.src}]:`, `${info.type}`, `${time}ms`, DataSignaturesToString(signatures)]);
            } else {
                list.push([`${info.name}:`, `${info.type}`, `${time}ms`]);
            }
        });

        port.input(new HiveNetPacket({ data: t, dest: HIVENETADDRESS.BROADCAST, dport: HIVENETPORT.PING, flags: { ping: true } }));
        await sleep(3000);
        port.destroy();
        return format(list, ' ');
    }
}
