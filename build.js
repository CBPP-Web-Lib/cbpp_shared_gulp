const browserify = require("browserify");
const fs = require("fs");
var dest = fs.createWriteStream("./gulplib_bundled.js");
var b = browserify({
  node:true,
  standalone:"cbpp_shared_gulp"
});
b.exclude(["v8","browserify","uglify-js","require-dir","gulp-git"]);
b.add("./gulplib.js");
b.bundle().pipe(dest);