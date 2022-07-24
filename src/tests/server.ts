import Hive from "../hive.js";

let node = new Hive('server');
node.buildTerminal(false, true);
node.listen(8080);
