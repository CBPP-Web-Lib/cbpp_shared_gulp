/*globals require, console, Buffer, Promise, setTimeout, clearTimeout*/
module.exports = function(gulp) {
  var l = {};

  var replace = l.replace = require("gulp-replace"),
    uglify = l.uglify = require("gulp-uglify"),
    rename = l.rename = require("gulp-rename"),
    webpack = l.webpack = require("webpack"),
    path = l.path = require("path"),
    fs = l.fs = require("fs"),
    parser = l.parser = require("csv-parse"),
    webpack_config = l.webpack_config = require("./webpack_config.js"),
    child_process = l.child_process = require('child_process'),
    server_process,
    fork = l.fork = child_process.fork,
    exec = l.exec = child_process.exec,
    spawn = l.spawn = child_process.spawn,
    text_encoding = l.text_encoding = require("text-encoding"),
    request = l.request = require("request"),
    decompress = l.decompress = require("gulp-decompress");

  var makeDirectory = l.makeDirectory = function(address, cb) {
    fs.mkdir(address, function(e) {
      if (e!==null) {
        if (e.code!=="EEXIST") {
          throw new Error(e);
        }
      }
      cb();
    });
  };
  
  l.index_files = [
    ["./index.*", "app.js"]
  ];

  function copyIndex() {
    console.log("copy index files");
    l.index_files.forEach(function(f) {
      var timestamp = Date.now();
      var prefix = "";
      var dest = "";
      if (f[2]) {
        prefix = "./" + f[2];
        dest = f[2];
      }
      var prod_dest = "js/" + f[1].replace(".js",".min.js");
      var debug_dest = "js/" + f[1];
      gulp.src(prefix + f[0])
        .pipe(l.replace(debug_dest,prod_dest + "?timestamp=" + timestamp))
        .pipe(l.replace("<head>",'<head>\n<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />'))
        .pipe(gulp.dest("./build/" + dest))
        .pipe(l.replace(prod_dest, debug_dest))
        .pipe(l.rename(function(path) {
          path.basename += "_debug";
        }))
        .pipe(gulp.dest("./build/" + dest));
    });
  }
  
  l.clone = function(obj) {
    var r = {};
    for (var prop in obj) {
      if (obj.hasOwnProperty(prop)) {
        if (Array.isArray(obj[prop])) {
          r[prop] = [];
          for (var i = 0, ii = obj[prop].length; i<ii; i++) {
            r[prop][i] = obj[prop][i];
          }
        } else if (Object.prototype.toString.call(obj[prop]) == '[object RegExp]') {
          r[prop] = obj[prop];
        } else if (typeof(obj[prop])==="object") {
          r[prop] = l.clone(obj[prop]);
        } else {
          r[prop] = obj[prop];
        }
      }
    }
    return r;
  };

  function doProdWebpack(entry, filename, config_transform, i) {
    return new Promise(function(resolve, reject) {
      copyIndex();
      var dest = path.resolve("./build/js");
      var config = config_transform(l.clone(l.webpack_config));
      config.entry = entry;
      config.devtool = false;
      config.mode = "production";
      config.module.rules.push(
        { test: /\.js$/,   exclude: /(node_modules\/core-js)/, use: {loader: 'babel-loader', options: {presets: ['@babel/preset-env']}}},
      );
      var filename_prod = filename.replace(".js",".min.js");
      config.output = {
        path: dest,
        filename: filename_prod
      };
      var compiler_prod = webpack(config);
      compiler_prod.run(resolve);
    });
  }

  function doWebpack(entry, filename, config_transform, i) {
    copyIndex();
    var dest = path.resolve("./build/js");
    var config = config_transform(l.clone(l.webpack_config));
    config.entry = entry;
    config.devtool = "source-map";
    config.mode = "development";
    config.output = {
      path: dest,
      filename: filename
    };
    var compiler_dev = webpack(config);
    compiler_dev.watch(config.watchOptions, function(err, stats) {
      if (err) {
        console.log("Error with dev watch callback: ");
        console.error(err);
      }
      if (stats.compilation.errors.length > 0) {
        console.log("Stats complation error: ");
        console.error(stats.compilation.errors);
      }
      console.log("Built dev bundle: " + filename);
    });
    compiler_dev.hooks.watchRun.tap("AlertChange", function() {
      if (i===0) {console.log("change detected");}
      copyIndex();
    });
  }
  
  gulp.task('buildDirectory', function(cb) {
    makeDirectory("./build", cb);
  });
  
  gulp.task('intermediate', function(cb) {
    makeDirectory("./intermediate",cb);
  });
  
  gulp.task("copyIndex", function(cb) {
    copyIndex();
    cb();
  });

  gulp.task("server", function(cb) {
    var command;
    var basedir = process.cwd();
    if (fs.existsSync(basedir + "/server.js")) {
      command = basedir + "/server.js";
    } else {
      command = __dirname + "/server.js";
    }
    l.stop = function() {
      if (typeof(l.serverShutdownCb)==="function") {
        l.serverShutdownCb();
      }
      process.exit();
    };
    var serverPort = 8000;
    var securePort = 8100;
    if (l.serverPort) {
      serverPort = l.serverPort;
    }
    if (l.securePort) {
      securePort = l.securePort;
    }
    if (l.noServer !== true) {
      server_process = fork(command);
      server_process.on("message", function(m) {
        console.log("Message from server: ", m);
        if (m==="ready") {
          server_process.send({serverPort: serverPort, basedir: basedir, securePort: securePort});
        }
      });
    }
    if (l.database) {
      
      console.log("starting mysql server");
      var start_command = l.database.start.split(" ");
      var base = start_command.shift();
      var database_process = spawn(base, start_command);
      database_process.on("close", function() {
        console.log("started mysql server");
      });
      process.on("SIGINT", function() {
        console.log("stopping mysql server");
        var end_command = l.database.stop.split(" ");
        var base = end_command.shift();
        var end_process = spawn(base, end_command);
        end_process.on("exit", function() {
          console.log("stopped mysql server");
          l.stop();
        });
      });
    }
    cb(); 
  });

  gulp.task('after_data', function(cb) {
    if (typeof(l.after_data)==="function") {
      l.after_data(cb);
    } else {
      cb();
    }
  });


  gulp.task('data', gulp.series('intermediate', function(taskDone) {
    l.dataHandler(function(allJSON) {
      l.fs.writeFile("./intermediate/data.json", JSON.stringify({data:allJSON}), taskDone);
    });
  }, "after_data"));

 
  l.build_list = [
    {
      entry:'./app.js',
      dest:"./app.js",
      config_transform: function(r) {return r;}
    }
  ];
  
  gulp.task("build-dev", function(cb) {
    l.build_list.forEach(function(build, i) {
      doWebpack(build.entry, build.dest, build.config_transform, i);
    });
    cb();
  });

  gulp.task('preBuild', function(cb) {
    if (typeof(l.preBuild)==="function") {
      l.preBuild();
    }
    cb();
  });

  gulp.task("build", gulp.series(gulp.parallel('buildDirectory', 'server', 'preBuild'), function(cb) {
    var Promises = [];
    l.build_list.forEach(function(build, i) {
      Promises.push(new Promise(function(resolve, reject) {
        doProdWebpack(build.entry, build.dest, build.config_transform, i).then(function() {
          resolve();
        });
      }));
    });
    Promise.all(Promises).then(function() {
      console.log("Done with production bundles");
      cb();
    });
  }));

  l.watch_list = [
    [['*.csv', "./data/*.csv","./csv/*.csv"],{usePolling: false},gulp.series('data')],
    [['./index.*'],{usePolling: false},gulp.series('copyIndex')]
  ];

  gulp.task('build-watch', gulp.series(gulp.parallel('buildDirectory', 'server', 'preBuild'), "build-dev", function(cb) {
    var watchers = [];
    l.watch_list.forEach(function(d) {
      var watcher = gulp.watch(d[0], d[1], d[2]);
      if (typeof(d[3])==="function") {
        watcher.on("change", function(file) {
          setTimeout(function() {
            d[3](file);
          }, 200);
        });
      }
      watchers.push(watcher);
    });
    l.serverShutdownCb = cb;
  }));

  l.dataEncoding = "utf-8";
  l.percentRounding = 2;
  l.dataHandler = function(f_cb) {
    var allJSON = {};
    var fileRead = function(err, data, file, cb) {
      if (err) {
        console.log(err);
        return;
      }
      data = Buffer.from(data,'hex');
      data = new text_encoding.TextDecoder(l.dataEncoding).decode(data);
      parser(data, function(err, data) {
        fileParse(err, data, file, cb);
      });
    };
    var m = Math.pow(10, l.percentRounding-2);
    var fileParse = function(err, data, file, cb) {
      if (err) {
        console.log(err);
        return;
      }
      data.forEach(function(row) {
        row.forEach(function(cell, col) {
          if (cell==="") {return;}
          var n;
          if (cell.charAt(cell.length-1)==="%") {
            n = Math.round(cell.replace(/[,%]/g,"")*m)/(m*100);
          } else {
            n = cell.replace(/Ð/g,"-");
            n = n.replace(/[,$\s]/g,"")*1;
          }
          if (!isNaN(n)) {
            row[col] = n;
          }
        });
      });
      allJSON[file] = data;
      cb();
    };
    var promiseMaker = function(file) {
      return new Promise(function(resolve, reject) {
        var fileArr = file.split(".");
        var extension = fileArr[fileArr.length-1];
        fileArr.splice(-1);
        var base = fileArr.join(".");
        if (extension==="csv") {
          fs.readFile("./csv/" + file, function(err, data) {
            fileRead(err, data, base, function() {
              resolve(base);
            });
          });
        } else {
          resolve(base);
        }
      });
    };
    if (fs.existsSync("./csv")) {
      fs.readdir("./csv", function(err, files) {
        var promises = [];
        files.forEach(function(file) {
          promises.push(promiseMaker(file));
        });
        Promise.all(promises).then(function() {
          f_cb(allJSON);
        });
      });
    }
  };
  
  gulp.task('default', gulp.series('build-watch'));
  l.gulp = gulp;
  return l;
};