export function randomInt(range: number = 32768) {
    return Math.floor(Math.random() * range);
}

let padding = new Array(80).fill(' ').join('');
// format output columns
export function format(rows: string[][], seperator = '') {
    let len: number[] = [];
    for (let i = 0; i < rows.length; i++) {
        let cols = rows[i];
        for (let j = 0; j < cols.length; j++) {
            if (!len[j]) len[j] = 0;
            let l = cols[j].length;
            if (l > len[j]) len[j] = l;
            if (len[j] > padding.length) len[j] = padding.length;
        }
    }
    return rows.map((cols) => cols.map((col, j) => `${col}${padding.slice(0, len[j] - col.length)}`).join(seperator)).join('\n') + '\n';
}

// format output columns seperated by delimiter
// example: 'test\trecord' -> 'testrecord'
//          'a\t123'       -> 'a   record'
export function formatTab(rows: string[], seperator = '', delimiter = '\t') {
    return format(
        rows.map((r) => r.split(delimiter)),
        seperator
    );
}

export function arrayUnion(array1: any[], array2: any[]) {
    return Array.from(new Set(array1.concat(array2)));
}

export function commonPrefix(stringArr: string[]) {
    if (stringArr.length <= 1) return stringArr[0] || '';
    const sorted = stringArr.sort();
    const head = sorted[0];
    const tail = sorted[sorted.length - 1];
    for (let i = 0; i < head.length; i++) {
        if (head[i] !== tail[i]) {
            return head.substring(0, i);
        }
    }
    return head;
}

export function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms > 0 ? ms : 0);
    });
}

export function isFunction(target: any): boolean {
    return target && (Object.prototype.toString.call(target) === '[object Function]' || 'function' === typeof target || target instanceof Function);
}

// https://stackoverflow.com/questions/57118453/structural-type-checking-in-javascript
// this one is for simple object checking only
export function duckTypeCheck(obj: any, model: any) {
    for (let prop in model) {
        if (!(prop in obj) || typeof obj[prop] !== typeof model[prop] || Array.isArray(model[prop]) !== Array.isArray(obj[prop])) {
            return false;
        }
        if (typeof model[prop] === 'object' && !Array.isArray(model[prop])) {
            if (!duckTypeCheck(obj[prop], model[prop])) {
                return false;
            }
        }
    }
    return true;
}

// check is obj in the format described by model
export function typeCheck(obj: any, model: any): boolean {
    if (typeof model === 'string') return typeCheckHelper(obj, model);
    if (typeof obj === 'object' && typeof model === 'object') return typeCheckObject(obj, model);
    return false;
}

function typeCheckObject(obj: any, model: any): boolean {
    for (let prop in model) {
        const type = model[prop];
        const data = obj[prop];
        if (type === 'any') return true;
        if (!(prop in obj)) {
            // property not exist on obj
            return false;
        }
        if (typeof type == 'string') {
            if (!typeCheckHelper(data, type)) return false;
        } else if (Array.isArray(type) && Array.isArray(data)) {
            // detailed array check
            for (let i = 0; i < data.length; i++) {
                let pass = false;
                for (let j = 0; j < type.length; j++) {
                    // check multiple possible types defined in model
                    if (typeCheckObject(data[i], type[j])) {
                        pass = true;
                        break;
                    }
                }
                if (!pass) return false;
            }
        } else if (typeof type == 'object') {
            // recursive typecheck
            if (!typeCheckObject(data, type)) return false;
        }
    }
    return true;
}

function typeCheckHelper(data: any, type: string): boolean {
    let tokens = type.split('|');
    for (let i = 0; i < tokens.length; i++) {
        if (typeCheckSimple(data, tokens[i])) return true;
    }
    return false;
}

function typeCheckSimple(data: any, type: string): boolean {
    if (type == 'function') {
        return isFunction(data);
    } else if (type == 'array') {
        // simple array check, dose not check type inside array
        return Array.isArray(data);
    }
    return type == typeof data;
}

export function debounce(func: Function, timeout: number = 300) {
    let timer: NodeJS.Timeout;
    return (...args: any[]) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            func(...args);
        }, timeout);
    };
}

export function reverseMap<K, V>(map: Map<K, V>): Map<V, K> {
    const map2: Map<V, K> = new Map();
    for (let [key, value] of map) map2.set(value, key);
    return map2;
}

export function reverseMapObj<K extends string | number | symbol, V>(obj: Record<K, V>): Map<V, K> {
    const map: Map<V, K> = new Map();
    for (let key in obj) map.set(obj[key], key);
    return map;
}

// for multiple inheritence
// https://codeburst.io/multiple-inheritance-with-typescript-mixins-d92d01198907
// https://www.typescriptlang.org/docs/handbook/mixins.html
export function applyMixins(derivedConstructor: any, baseConstructors: any[]) {
    baseConstructors.forEach((baseConstructor) => {
        Object.getOwnPropertyNames(baseConstructor.prototype).forEach((name) => {
            const d = Object.getOwnPropertyDescriptor(baseConstructor.prototype, name);
            if (d) Object.defineProperty(derivedConstructor.prototype, name, d);
        });
    });
}

// Generic option wrapper
// export type Options<T> = {
//     [O in keyof T]?: T[O];
// };

// typeof T also returns class constructor, but this one is fuzzy and stop TypeScript from throwing shit errors
export type Constructor<T> = new (...args: any) => T;

/*
parseArgsStringToArgv: Executed: 2681065, time: 30s, calls/s = 89369
parseArgv:             Executed: 3087747, time: 30s, calls/s = 102925
*/
export function parseArgv(string: string): string[] {
    let start = 0;
    let argv: string[] = [];
    do {
        let result = findFirstWord(string, start);
        if (!result) break;
        argv.push(string.substring(result[0], result[1]));
        start = result[1] + 1;
    } while (start < string.length);
    return argv;
}

export function findFirstWord(string: string, start: number = 0): number[] | null {
    let match: '' | ' ' | '"' | "'" = '';
    let quoteStart = false;
    for (let i = start; i < string.length; i++) {
        const char = string[i];
        if (char == '\\') {
            // ignore next character
            i++;
        } else if (match == '' && char != ' ') {
            start = i;
            if (char == "'" || char == '"') {
                // start of quote
                quoteStart = true;
                match = char;
            } else {
                // start of word
                match = ' ';
            }
        } else if (match == ' ') {
            switch (char) {
                case "'":
                    // start of quote
                    match = "'";
                    break;
                case '"':
                    // start of quote
                    match = '"';
                    break;
                case ' ':
                    // end of word
                    return [start, i];
            }
        } else if (match == char) {
            if (quoteStart) {
                // end of quote
                return [start + 1, i];
            } else {
                match = ' ';
            }
        }
    }
    if (match == ' ') return [start, string.length]; // end of string
    if (match != '') {
        // bad input, cannot find ending quote
        // try find next complete word's end
        let result = findFirstWord(string, start + 1);
        if (!result) return null;
        result[0] = start;
        return result;
    }
    return null;
}

export async function performanceTest(f: Function, timeLimitSeconds: number) {
    let start = Date.now();
    let i = 0;
    do {
        await f();
        i++;
    } while (Date.now() - start < timeLimitSeconds * 1000);
    return {
        executed: i,
        totalTime: Date.now() - start,
    };
}

export async function performanceTestAdvanced(
    fs: Function[],
    timeLimitSecondsPerCycle: number,
    runs: number,
    log: (message: string) => void = console.log
) {
    let metrics: { executed: number; totalTime: number }[] = [];
    log(`Running performance test with ${fs.length} functions, ${timeLimitSecondsPerCycle}s per cycle for ${runs} runs...`);
    for (let r = 0; r < runs; r++) {
        for (let i = 0; i < fs.length; i++) {
            log(`Running function ${i + 1}...`);
            let result = await performanceTest(fs[i], timeLimitSecondsPerCycle);
            let s = result.totalTime / 1000;
            log(`Executed: ${result.executed}, time: ${s}s, calls/s = ${Math.round(result.executed / s)}`);
            if (metrics[i]) {
                metrics[i].executed += result.executed;
                metrics[i].totalTime += result.totalTime;
            } else {
                metrics[i] = result;
            }
        }
    }
    log('Test completed.');
    for (let i = 0; i < fs.length; i++) {
        let s = metrics[i].totalTime / 1000;
        log(`Function ${i + 1}: Executed: ${metrics[i].executed}, time: ${s}s, calls/s = ${Math.round(metrics[i].executed / s)}`);
    }
}

let uuidv7PrevTimestamp = -1;
let uuidv7Seq = 0;
// https://stackoverflow.com/questions/71816194/uuidv6-v7-v8-in-javascript-browser
export function uuidv7() {
    const UNIX_TS_MS_BITS = 48;
    const VER_DIGIT = '7';
    const SEQ_BITS = 12;
    const VAR = 0b10;
    const VAR_BITS = 2;
    const RAND_BITS = 62;

    const timestamp = Math.max(Date.now(), uuidv7PrevTimestamp);
    uuidv7Seq = timestamp === uuidv7PrevTimestamp ? uuidv7Seq + 1 : 0;
    uuidv7PrevTimestamp = timestamp;

    const var_rand = new Uint32Array(2);
    crypto.getRandomValues(var_rand);
    var_rand[0] = (VAR << (32 - VAR_BITS)) | (var_rand[0] >>> VAR_BITS);

    const digits =
        timestamp.toString(16).padStart(UNIX_TS_MS_BITS / 4, '0') +
        VER_DIGIT +
        uuidv7Seq.toString(16).padStart(SEQ_BITS / 4, '0') +
        var_rand[0].toString(16).padStart((VAR_BITS + RAND_BITS) / 2 / 4, '0') +
        var_rand[1].toString(16).padStart((VAR_BITS + RAND_BITS) / 2 / 4, '0');

    return digits.slice(0, 8) + '-' + digits.slice(8, 12) + '-' + digits.slice(12, 16) + '-' + digits.slice(16, 20) + '-' + digits.slice(20);
}
