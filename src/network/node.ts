import HiveComponent from '../lib/component.js';
import DataIO from './dataIO.js';
import { HiveNetPacket, HIVENETPORT } from './hiveNet.js';
import HTP from './protocol.js';

/*
    OSI model layer 6 - presentation layer
*/
export default class HiveNetNode extends HiveComponent {
    stdIO: DataIO = new DataIO(this, 'stdIO');
    HTP: HTP;

    constructor(name: string, HTP: HTP) {
        super(name);
        this.HTP = HTP;
        this.init();
    }

    init() {
        this.HTP.listen(HIVENETPORT.ECHO, () => {
            return new HiveNetPacket({ data: Date.now(), flags: { pong: true } });
        });

        this.HTP.listen(HIVENETPORT.DISCARD, () => {});

        this.HTP.listen(HIVENETPORT.MESSAGE, (data, signatures) => {
            this.stdIO.output(data.data, signatures);
        });
    }

    ping(dest: string, options: { timeout?: number; dport?: number } = {}): Promise<string | number[]> {
        return new Promise((resolve) => {
            if (!options.timeout) options.timeout = 3000;
            if (!options.dport) options.dport = HIVENETPORT.ECHO;
            let timeout = false;
            let t1 = Date.now();

            let timer = setTimeout(() => {
                timeout = true;
                resolve('timeout');
            }, options.timeout);

            this.HTP.sendAndReceiveOnce(t1, dest, options.dport, { ping: true })
                .then((data) => {
                    if (timeout) return;
                    clearTimeout(timer);
                    resolve([Date.now() - t1, data.data - t1]);
                })
                .catch(() => resolve('Error'));
        });
    }

    message(dest: string, data: any) {
        this.HTP.send(data, dest, HIVENETPORT.MESSAGE);
    }
}
