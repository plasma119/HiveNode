import HiveCommand from '../../lib/hiveCommand.js';
import { HiveNetPacket, HIVENETPORT } from '../../network/hiveNet.js';
import HiveNetNode from '../../network/node.js';
import HiveApp from '../app.js';

export default class HiveAppPing extends HiveApp {
    constructor(node: HiveNetNode) {
        super(node, 'ping');
    }

    init() {
        this.node.HTP.listen(HIVENETPORT.PING, (packet) => {
            if (packet.flags.ping) return new HiveNetPacket({ data: Date.now(), flags: { pong: true } });
            return null;
        });
    }

    initProgram(baseProgram: HiveCommand) {
        baseProgram.addNewCommand('ping', 'Ping target node')
            .addNewArgument('<UUID>', 'target UUID')
            .setAction(async(args) => {
                let [rt, ht] = await this.ping(args['UUID']);
                return `Round trip: ${rt}ms, Half trip: ${ht}ms`;
            });
    }

    // return [roundtrip time, half-trip time]
    ping(dest: string, options: { timeout?: number; dport?: number } = {}): Promise<string | number[]> {
        return new Promise((resolve) => {
            if (!options.timeout) options.timeout = 3000;
            if (!options.dport) options.dport = HIVENETPORT.PING;
            let timeout = false;
            let t1 = Date.now();

            let timer = setTimeout(() => {
                timeout = true;
                resolve('timeout');
            }, options.timeout);

            this.node.HTP.sendAndReceiveOnce(t1, dest, options.dport, { ping: true })
                .then((data) => {
                    if (timeout) return;
                    clearTimeout(timer);
                    resolve([Date.now() - t1, data.data - t1]);
                })
                .catch(() => resolve('Error'));
        });
    }
}
