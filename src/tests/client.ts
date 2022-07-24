import Hive from "../hive.js";

let node = new Hive('client');
node.buildTerminal(false, true);
node.connect('127.0.0.1', 8080);
