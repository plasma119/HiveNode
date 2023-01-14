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

    static encrypt(algorithm: string, key: Buffer, str: string) {
        const iv = Crypto.randomBytes(16);
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

export function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
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
export function typeCheck(obj: any, model: any) {
    for (let prop in model) {
        const type = model[prop];
        const data = obj[prop];
        if (!(prop in obj)) {
            // property not exist on obj
            return false;
        }
        if (typeof type === 'string') {
            if (!typeCheckHelper(data, type)) return false;
        } else if (Array.isArray(type) && Array.isArray(data)) {
            // detailed array check
            for (let i = 0; i < data.length; i++) {
                let failed = false;
                for (let j = 0; j < type.length; j++) {
                    if (typeCheck(data[i], type[j])) break;
                    failed = true;
                }
                if (failed) return false;
            }
        } else if (typeof type === 'object') {
            // recursive typecheck
            if (!typeCheck(data, type)) return false;
        }
    }
    return true;
}

function typeCheckHelper(data: any, type: string) {
    let tokens = type.split('|');
    for (let i = 0; i < tokens.length; i++) {
        if (typeCheckSimple(data, tokens[i])) return true;
    }
    return false;
}

function typeCheckSimple(data: any, type: string) {
    if (type === 'any') return true;
    if (type === 'array') {
        // simple array check, dose not check type inside array
        if (!Array.isArray(data)) return false;
    } else if (type != typeof data) {
        // property type not matching
        return false;
    }
    return true;
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
