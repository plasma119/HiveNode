import HiveCommand from '../../lib/hiveCommand.js';
import { sleep } from '../../lib/lib.js';
import { HiveNetDeviceInfo, HIVENETPORT } from '../../network/hiveNet.js';
import HiveNetNode from '../../network/node.js';
import HiveApp from '../app.js';

export default class HiveAppInfo extends HiveApp {
    list: Map<string, { timestamp: number; info: HiveNetDeviceInfo }> = new Map();

    constructor(node: HiveNetNode) {
        super(node, 'info');
    }

    init() {
        this.node.HTP.listen(HIVENETPORT.INFO, () => this.node.getDeviceInfo());
    }

    initProgram(baseProgram: HiveCommand) {
        baseProgram.addNewCommand('info', 'Display current device info').setAction(() => this.node.getDeviceInfo());
    }

    getInfo(UUID: string): Promise<{ timestamp: number; info: HiveNetDeviceInfo } | null> {
        return new Promise(async (resolve) => {
            let resolved = false;
            let result = this.list.get(UUID);
            if (result) {
                // in cache
                resolve(result);
                resolved = true;
                return;
            }

            sleep(5000).then(() => {
                // failed to resolve
                if (resolved) return;
                resolve(null);
                resolved = true;
            })

            // try to resolve through HiveNet
            const data = await this.node.HTP.sendAndReceiveOnce('', UUID, HIVENETPORT.INFO);
            if (resolved) return;
            result = {
                timestamp: Date.now(),
                info: data.data
            };
            this.list.set(UUID, result);
            resolve(result);
            resolved = true;
            return;
        });
    }
}
