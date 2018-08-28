const browserify = require("browserify");
const fs = require("fs");
var dest = fs.createWriteStream("./gulplib_bundled.js");
var b = browserify();
b.external("v8");
b.add("./gulplib.js");
b.bundle().pipe(dest);
