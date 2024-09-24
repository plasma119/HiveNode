import * as Crypto from 'crypto';

export default class Encryption {
    static base64Encode(str: string, encoding: 'ascii' | 'utf-8' | 'binary' = 'utf-8') {
        const buff = Buffer.from(str ? str : '', encoding);
        return buff.toString('base64');
    }

    static base64Decode(str: string, encoding: 'ascii' | 'utf-8' | 'binary' = 'utf-8') {
        const buff = Buffer.from(str ? str : '', 'base64');
        return buff.toString(encoding);
    }

    static hash(str: string, algorithm: 'sha256' | 'md5' = 'sha256') {
        const hash = Crypto.createHash(algorithm);
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
