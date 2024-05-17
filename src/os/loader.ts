import path from 'path';

import { BootConfig } from './bios.js';
import { WorkerConfig } from './worker.js';

// Identify current process's loader & retrieve configs

type Loader =
    | {
          type: 'os';
          bootConfig: BootConfig;
          argv: string[];
      }
    | {
          type: 'workerProcess';
          bootConfig: BootConfig;
          workerConfig: WorkerConfig;
      };

let currentLoader: Loader | null = null;

export function setLoader(loader: Loader) {
    currentLoader = loader;
}

export function getLoader() {
    return currentLoader;
}

// for normal path
export function resolveFilePath(file: string) {
    if (!currentLoader) throw new Error('Cannot resolve file path without loader!');
    return path.join(currentLoader.bootConfig.HiveNodePath, '/', file);
}