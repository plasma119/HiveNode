import path from 'path';
import { fileURLToPath } from 'url';

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

// for resolving file inside HiveNode, e.g. worker file
export function resolveFilePath(file: string) {
    if (!currentLoader) throw new Error('Cannot resolve file path without loader!');
    return './' + path.join(currentLoader.bootConfig.HiveNodePath, '/', file);
}

// for resolving import file, e.g. Loader loading main file
export function resolveFileImport(importMetaUrl: string, file: string) {
    const __filename = fileURLToPath(importMetaUrl);
    const __dirname = path.dirname(__filename);
    let relativePath = path.relative(__dirname, path.resolve(file));
    return relativePath.replace('\\', '/');
}