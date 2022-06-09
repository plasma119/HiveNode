import Terminal from './lib/terminal.js';
import { DataTransformer } from './network/dataIO.js';
import { HIVENETADDRESS, HiveNetPacket, HIVENETPORT } from './network/hiveNet.js';
import HiveNetNode from './network/node.js';

const dumdum = new HiveNetNode('dumdum');
const terminal = new Terminal();
const dt = new DataTransformer(dumdum.stdIO);

terminal.connectDevice(process);
terminal.stdIO.connect(dt.stdIO);
dt.setInputTransform((data) => {
    return new HiveNetPacket({ data, dest: HIVENETADDRESS.LOCAL, dport: HIVENETPORT.SHELL });
});
dt.setOutputTransform((data) => {
    if (data instanceof HiveNetPacket) {
        return data.data;
    }
    return data;
});

export default dumdum;
