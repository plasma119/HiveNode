import os from 'node:os';

import { version } from '../../index.js';
import HiveCommand from '../lib/hiveCommand.js';
import HiveProcess from '../process.js';

// https://superuser.com/questions/285572/equivalent-to-sysinternals-process-explorer-on-linux
// https://htop.dev/
// https://stackoverflow.com/questions/71542163/how-to-read-user-input-from-terminal-before-pressing-enter-using-node-and-javasc
// TODO: figure out how to take full control of terminal from hiveProcess
// ... we don't really need this level of fancy process manager... yet...

export default class HiveProcessProcessManager extends HiveProcess {
    initProgram() {
        const program = new HiveCommand('top', 'process manager');
        const top = program.addNewCommand('top', 'process manager').setAction(() => {
            let str = `TOP - HiveNode OS[${this.os.NodeName}] version ${version}\n`;
            let nodeInfo = getNodeInfo();
            let memory = nodeInfo.memory;
            let nodeCPUInfo = getNodeCPUInfo();
            str += `Node Up time: ${nodeInfo.uptime.toFixed(1)}s\n`; // TODO: Format Time
            str += `Node Platform: ${nodeInfo.platform}\n`;
            str += `Node Version: ${nodeInfo.nodeVersion}\n`;
            str += `Node CPU time: [${nodeCPUInfo.user}/${nodeCPUInfo.system}]\n`;
            str += `Totoal RSS: ${memory.rss.toFixed(1)} MB, Heap: ${memory.heap.toFixed(1)}/${memory.heapMax.toFixed(1)} MB\n`;

            // TODO: workers/threads

            str += `Hive Processes:\n`;
            for (let [_pid, p] of this.os.processes) {
                // only grab root process
                if (p.ppid === -1) str += recursiveProcessExplorer(p);
            }

            return str;
        });

        top.addNewCommand('system', 'display system info').setAction(() => {
            let str = `TOP - HiveNode OS[${this.os.NodeName}] version ${version}\n`;
            str = `Displaying system info:\n`;
            let OSInfo = getOSInfo();
            str += `Host: ${OSInfo.hostname}\n`;
            str += `Uptime: ${OSInfo.uptime.toFixed(0)}s\n`; // TODO: Format Time
            str += `Arch: ${OSInfo.arch}\n`;
            str += `Machine: ${OSInfo.machine}\n`;
            str += `Platform: ${OSInfo.platform}\n`;
            str += `Release: ${OSInfo.release}\n`;
            str += `Version: ${OSInfo.version}\n`;
            str += `Type: ${OSInfo.type}\n`;
            str += `CPU [1/${OSInfo.cpus.length}]: ${OSInfo.cpus[0].model} Speed: ${OSInfo.cpus[0].speed}\n`;
            str += `Load Avg: ${OSInfo.loadavg}\n`;
            str += `Available Parallelism: ${OSInfo.availableParallelism}\n`;
            str += `Memory: ${OSInfo.usedmem.toFixed(0)}MB / ${OSInfo.totalmem.toFixed(0)}MB\n`;
            return str;
        });

        return top;
    }
}

function recursiveProcessExplorer(hiveProcess: HiveProcess, tab: string = '') {
    if (tab.length > 100) throw new Error(`[recursiveProcessExplorer]: ERROR: Possible loop reference in hiveProcess`);
    let str = `${tab}${hiveProcess.toString()} ${hiveProcess.argv}\n`;
    for (let [_pid, p] of hiveProcess.childs) {
        str += recursiveProcessExplorer(p, tab + '  ');
    }
    return str;
}

export function getNodeInfo() {
    const memory = process.memoryUsage();
    // process.resourceUsage()
    // https://nodejs.org/docs/latest-v20.x/api/process.html#processresourceusage
    return {
        platform: process.platform,
        uptime: process.uptime(),
        nodeVersion: process.version,
        cwd: process.cwd(),
        memory: {
            arrayBuffers: memory.arrayBuffers / 1024 / 1024,
            external: memory.external / 1024 / 1024,
            rss: memory.rss / 1024 / 1024,
            heap: memory.heapUsed / 1024 / 1024,
            heapMax: memory.heapTotal / 1024 / 1024,
            availableMemory: process.availableMemory ? process.availableMemory() : 0,
        },
    };
}

let cpuUsage = process.cpuUsage();
// TODO: LRUMap for usage history
setInterval(() => {
    cpuUsage = process.cpuUsage(cpuUsage);
}, 1000);
export function getNodeCPUInfo() {
    return cpuUsage;
}

export function getOSInfo() {
    const freemem = os.freemem();
    const totalmem = os.totalmem();
    return {
        hostname: os.hostname(),
        arch: os.arch(),
        machine: os.machine(),
        platform: os.platform(),
        release: os.release(),
        version: os.version(),
        type: os.type(),
        uptime: os.uptime(),

        cpus: os.cpus(),
        loadavg: os.loadavg(),
        availableParallelism: os.availableParallelism(),
        freemem: freemem / 1024 / 1024,
        usedmem: (totalmem - freemem) / 1024 / 1024,
        totalmem: totalmem / 1024 / 1024,
    };
}
