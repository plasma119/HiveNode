import { randomUUID } from 'crypto';

export default class HiveComponent {
    UUID: string = randomUUID();
    name: string;

    constructor(name: string) {
        this.name = name;
    }
}