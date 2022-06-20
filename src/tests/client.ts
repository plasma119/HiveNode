import { Hive } from "../hive.js";

let node = new Hive('client');
node.buildTerminal(false);
node.connect('127.0.0.1', 8080);
