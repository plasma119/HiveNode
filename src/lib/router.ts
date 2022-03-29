
export class DataPacket {
    data: any;
    src: string;
    dest: string;
    ttl: number;

    constructor(data: any, src: string, dest: string, ttl: number = 64) {
        this.data = data;
        this.src = src;
        this.dest = dest;
        this.ttl = ttl;
    }
};
