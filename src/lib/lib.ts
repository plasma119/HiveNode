import * as Crypto from 'crypto';

export class Encryption {
    static base64Encode(str: string, encoding: 'ascii' | 'utf-8' | 'binary' = 'utf-8') {
        const buff = Buffer.from(str ? str : '', encoding);
        return buff.toString('base64');
    }

    static base64Decode(str: string, encoding: 'ascii' | 'utf-8' | 'binary' = 'utf-8') {
        const buff = Buffer.from(str ? str : '', 'base64');
        return buff.toString(encoding);
    }

    static hash(str: string) {
        const hash = Crypto.createHash('sha256');
        hash.update(str);
        return hash;
    }

    static hmac(str: string, secret: string) {
        const hmac = Crypto.createHmac('sha256', secret);
        hmac.update(str);
        return hmac;
    }

    static randomData(size: number = 64) {
        return Crypto.randomBytes(size);
    }

    static genKey(secret: string, salt: string, size: number = 32) {
        return Crypto.scryptSync(secret, salt, size);
    }

    // aes-256-ctr + HMAC or aes-256-cbc + HMAC is good
    static encrypt(algorithm: string, key: Buffer, str: string) {
        const iv = Crypto.randomBytes(16); // iv MUST not collide
        const cipher = Crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(str, 'utf-8', 'base64');
        encrypted += cipher.final('base64');
        return [iv.toString('base64'), encrypted];
    }

    static decrypt(algorithm: string, key: Buffer, iv: string, encrypted: string) {
        const decipher = Crypto.createDecipheriv(algorithm, key, Buffer.from(iv, 'base64'));
        let decryped = decipher.update(encrypted, 'base64', 'utf-8');
        decryped += decipher.final('utf-8');
        return decryped;
    }

    // aes-256-gcm = aes-256-ctr + HMAC
    static encryptGCM(key: Buffer, str: string) {
        const iv = Crypto.randomBytes(12); // iv MUST not collide
        const cipher = Crypto.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update(str, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        return [iv.toString('base64'), encrypted, cipher.getAuthTag().toString('base64')];
    }

    static decryptGCM(key: Buffer, iv: string, encrypted: string, authTag: string) {
        const decipher = Crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
        decipher.setAuthTag(Buffer.from(authTag, 'base64'));
        let decryped = decipher.update(encrypted, 'base64', 'utf8');
        decryped += decipher.final('utf8');
        return decryped;
    }
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
                    if (typeCheck(data[i], type[j])) {
                        pass = true;
                        break;
                    }
                }
                if (!pass) return false;
            }
        } else if (typeof type == 'object') {
            // recursive typecheck
            if (!typeCheck(data, type)) return false;
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
export type Options<T> = {
    [O in keyof T]?: T[O];
};

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
            // end of quote
            if (quoteStart) {
                return [start + 1, i];
            } else {
                match = ' ';
            }
        }
    }
    if (match == ' ') return [start, string.length];
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
            log(`Executed: ${result.executed}, time: ${s}s, calls/s = ${Math.round((result.executed / s))}`);
            if (metrics[i]) {
                metrics[i].executed += result.executed;
                metrics[i].totalTime += result.totalTime;
            } else {
                metrics[i] = result;
            }
        }
    }
    log('Test completed.')
    for (let i = 0; i < fs.length; i++) {
        let s = metrics[i].totalTime / 1000;
        log(`Function ${i + 1}: Executed: ${metrics[i].executed}, time: ${s}s, calls/s = ${Math.round((metrics[i].executed / s))}`);
    }
}
