/*globals require, console, Buffer, Promise, setTimeout, clearTimeout*/
module.exports = function(gulp) {
  var l = {};

  var replace = l.replace = require("gulp-replace"),
    rename = l.rename = require("gulp-rename"),
    webpack = l.webpack = require("webpack"),
    path = l.path = require("path"),
    fs = l.fs = require("fs"),
    parser = l.parser = require("csv-parse"),
    webpack_config = l.webpack_config = require("./webpack_config.js"),
    exec = l.exec = require('child_process').exec;

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
  
  function copyIndex() {
    gulp.src('./index.*')
      .pipe(l.replace("js/app.js","js/app.min.js"))
      .pipe(gulp.dest("./build/"))
      .pipe(l.replace("js/app.min.js","js/app.js"))
      .pipe(l.rename(function(path) {
        path.basename += "_debug";
      }))
      .pipe(gulp.dest("./build/"));
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
  }

  function doWebpack(entry, filename, config_transform, i) {
    copyIndex();
    var dest = path.resolve("./build/js");
    var config = config_transform(l.clone(l.webpack_config));
    config.entry = entry;
    config.mode = "development";
    config.output = {
      path: dest,
      filename: filename
    };
    var compiler_dev = webpack(config);
    var prod_config = l.clone(config);
    var prod_filename = filename.replace(".js","") + ".min" + ".js";
    prod_config.mode = "production";
    prod_config.output = {
      path: dest,
      filename: prod_filename
    };
    prod_config.module.rules.push({
      test: /\.js$/, 
      loader: "babel-loader", 
      enforce: "pre",
      options: require("./babel_config.json")
    });
    var compiler_prod = webpack(prod_config);
    var prod_is_running = false;
    var pending_comp = false;
    var delay_timer;
    var prod_callback = function(err, stats) {
      prod_is_running = false;
      if (err) {console.log(err);}
      if (stats.compilation.errors.length > 0) {
        console.log(stats.compilation.errors);
      }
      console.log("built prod bundle: " + prod_filename);
    };
    compiler_dev.watch(config.watchOptions, function(err, stats) {
      if (err) {console.log(err);}
      if (stats.compilation.errors.length > 0) {
        console.log(stats.compilation.errors);
      }
      console.log("built dev bundle:" + filename);
      if (!prod_is_running) {
        prod_is_running = true;
        compiler_prod.run(prod_callback);
      } else {
        pending_comp = true;
        compiler_prod.hooks.afterCompile.tap("WaitUntilDone", function() {
          if (!pending_comp) {return;}
          clearTimeout(delay_timer);
          delay_timer = setTimeout(function() {
            prod_is_running = true;
            pending_comp = false;
            compiler_prod.run(prod_callback);
          }, 500);
        });
      }
    });
    compiler_dev.hooks.watchRun.tap("AlertChange", function() {
      if (i===0) {console.log("change detected");}
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
    var http = require('http');
    var fs = require("fs");
    var exec = require("child_process").exec;
    var serverPort = 8000;
    if (typeof(l.serverPort)!=="undefined") {
      serverPort = l.serverPort;
    }
    var server = http.createServer(function(req, res) {
      function parse_php_res(f) {
        var offset;
        for (var i = 0, ii = f.length; i<ii; i++) {
          //utf8 double line break
          if (f[i]===13 && f[i+1]===10 && f[i+2]==13 && f[i+3]===10) {
            offset = i;
          }
        }
        var headers = [];
        for (i = 0; i<offset;i++) {
          headers.push(f[i]);
        }
        var body = [];
        for (i = offset+4, ii = f.length; i<ii; i++) {
          body.push(f[i]);
        }
        headers = Buffer.from(headers).toString("utf8").split("\r\n");
        body = Buffer.from(body);
        var headersObj = {};
        headers.forEach(function(header) {
          header = header.split(":");
          headersObj[header[0]] = header[1];
        });
        var result = {};
        result.headers = headersObj;
        result.body = body;
        return result;
      }
      
      try {
        var headers = {
          'max-age':86400,
          'Access-Control-Allow-Origin':"*",
          'Vary':"Access-Control-Allow-Origin",
          'Access-Control-Allow-Headers':'referrer, range, accept-encoding, x-requested-with',
          'Access-Control-Allow-Methods':'POST, GET, OPTIONS'
        };
        var file = req.url.split("?")[0];
        var ext = file.split(".")[file.split(".").length-1];
        
        if (ext==="php") {
          var command = "php-cgi \"" + __dirname + "/build" + file + "\" " + req.url.split("?")[1].split("&").join(" ");
          exec(command, {encoding:"Buffer"}, function(err, f) {
            var parsed = parse_php_res(f);
            res.writeHead(200, parsed.headers);
            res.write(parsed.body);
            res.end();
          });
        } else {
          if (ext==="svg") {
            res.setHeader("Content-Type","image/svg+xml");
          }
          fs.readFile("./build" + file, function (err, file) {
            if (err) {
              res.end('HTTP/1.1 400 Bad Request\r\n\r\n');
              return;
            }
            if (ext === "json") {
              headers['Content-Type'] = 'application/json';
            }
            res.writeHead(200, headers);
            res.write(file);
            res.end();
          });
        }
      } catch (ex) {
        res.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      }
    });
    server.on('clientError', function (err, socket) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });
    server.listen(serverPort);
    cb(); 
  });

  gulp.task('data', gulp.series('intermediate', function(taskDone) {
    l.dataHandler(function(allJSON) {
      l.fs.writeFile("./intermediate/data.json", JSON.stringify({data:allJSON}), taskDone);
    });
  }));

  l.build_list = [
    {
      dest:"./app.js",
      config_transform: function(r) {return r;}
    }
  ];
  
  gulp.task("build", function(cb) {
    l.build_list.forEach(function(build, i) {
      doWebpack("./app.js", build.dest, build.config_transform, i);
    });
    cb();
  });

  l.watch_list = [
    [['./**/*.csv'],{usePolling: false},gulp.series('data')],
    [['./index.*'],{usePolling: false},gulp.series('copyIndex')]
  ];

  gulp.task('preBuild', function(cb) {
    cb();
  });

  gulp.task('build-watch', gulp.series(gulp.parallel('buildDirectory', 'server', 'preBuild'), "build", function() {
    l.watch_list.forEach(function(d) {
      gulp.watch(d[0], d[1], d[2]);
    });
  }));

  l.dataEncoding = "windows-1252";
  l.percentRounding = 2;
  l.dataHandler = function(f_cb) {
    var allJSON = {};
    var fileRead = function(err, data, file, cb) {
      data = Buffer.from(data,'hex');
      data = new text_encoding.TextDecoder(l.dataEncoding).decode(data);
      parser(data, function(err, data) {
        fileParse(err, data, file, cb);
      });
    };
    var m = Math.pow(10, l.percentRounding-2);
    var fileParse = function(err, data, file, cb) {
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
  