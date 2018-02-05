/*globals require, console, Buffer, Promise*/
module.exports = function() {

var l = {};

  l.gulp = gulp = require('gulp'),
  l.util = util = require('gulp-util'),
  l.sass = sass = require('gulp-sass'),
  l.uglify = uglify = require('gulp-uglify'),
  l.watch = watch = require('gulp-watch'),
  l.concat = concat = require('gulp-concat'),
  l.notify = notify = require('gulp-notify'),
  l.browserify = browserify = require('browserify'),
  l.browserify_css = browserify_css = require('browserify-css'),
  l.source = source = require("vinyl-source-stream"),
  l.sourcemaps = sourcemaps = require('gulp-sourcemaps'),
  l.buffer = buffer = require('vinyl-buffer'),
  l.watchify = watchify = require('watchify'),
  l.stringify = stringify = require('stringify'),
  l.fs = fs = require("fs"),
  l.text_encoding = text_encoding = require("text-encoding"),
  l.parser = parser = require("csv-parse"),
  l.git = git = require("gulp-git"),
  l.exec = exec = require('child_process').exec;
    //pako = require("pako");

function swallowError(error) {
    console.log(error.toString());
    this.emit('end');
}

function copyIndex() {
  fs.createReadStream('./index.html').pipe(fs.createWriteStream('./build/index.html'));
}

l.get_cbpp_shared_lib = function(name, cb) {
  console.log("Getting shared CBPP libraries...");
  if (!fs.existsSync("./CBPP_" + name)) {
    git.clone("https://github.com/CenterOnBudget/" + name, {args: "--depth=1"}, function(err) {
      if (err) {
        if (err.code===128) {
          console.log(name + " already exists");
        } else {
          throw err;
        }
      }
      exec('npm install', {cwd: process.cwd() + "/" + name}, function(err) {
        if (err) {
          console.log(err);
          cb();
        }
      });
    });
  }
};

// sass task
gulp.task('sass', function () {
    gulp.src(['./**/*.scss', '!../**/*/node_modules/**/*.scss'])
    .pipe(sass())
    .on('error', swallowError)
    .pipe(gulp.dest('./'));
});

function doBrowserify(entries) {
  copyIndex();
  var b = browserify({
      entries: entries,
      debug: true,
      cache: {},
      packageCache: {}
  });
  b.plugin(watchify, {
    poll: true
  });
  b.transform(browserify_css);
  b.transform(stringify, {
      appliesTo: {includeExtensions: ['.txt','.csv','.html']}
  });
  b.doBundle = function() {
    var r = this.bundle()
      .on('error', swallowError)
      .pipe(source('app.js'))
      .pipe(buffer());

    r.doUglify = function() {
      this.pipe(sourcemaps.init({loadMaps: true}))
        // Add transformation tasks to the pipeline here.
        .pipe(uglify())
        .pipe(sourcemaps.write('./'));
      return this;
    };

    r.writeBundle = function() {
      this.pipe(gulp.dest('./build/js')).on("end", function() {
        console.log("built");
      });
      return this;
    };
    return r;
  };
  return b;
}

function makeDirectory(address, cb) {
  fs.mkdir(address, function(e) {
    if (e!==null) {
      if (e.code!=="EEXIST") {
        throw new Error(e);
      }
    }
    cb();
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
  var server = http.createServer(function(req, res) {
    try {
      fs.readFile("./build" + req.url, function (err, file) {
        if (err) {
          res.end('HTTP/1.1 400 Bad Request\r\n\r\n');
          return;
        }
        res.writeHead(200, {
          'Cache-Control': 'no-cache'
        });
        res.write(file);
        res.end();
      });
    } catch (ex) {
      res.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    }
  });
  server.on('clientError', function (err, socket) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });
  server.listen(8000);
  cb();
});

gulp.task('build-watch', ['sass', 'buildDirectory', 'server'], function() {
  var ops = {usePolling: true};
  gulp.watch(['./**/*.scss'],ops,['sass']);
  gulp.watch(['./**/*.csv'],ops,['data']);
  gulp.watch(['./index.html'],ops,['copyIndex']);
  var b = doBrowserify("./app.js");
  b.on('update', function() {
    console.log("file change detected");
    b.doBundle().writeBundle();
  });
  return b
    .doBundle()
    .writeBundle();
});

gulp.task('build', ['sass', 'buildDirectory', 'cbpp_shared_lib'], function() {
  var b = doBrowserify("./app.js");
  return b
    .doBundle()
    .doUglify()
    .writeBundle();
});

l.defaultDataHandler = function(f_cb) {
  var allJSON = {};
  var fileRead = function(err, data, file, cb) {
    data = Buffer.from(data,'hex');
    data = new text_encoding.TextDecoder("windows-1252").decode(data);
    parser(data, function(err, data) {
      fileParse(err, data, file, cb);
    });
  };
  var fileParse = function(err, data, file, cb) {
    data.forEach(function(row) {
      row.forEach(function(cell, col) {
        if (cell==="") {return;}
        var n;
        if (cell.charAt(cell.length-1)==="%") {
          n = Math.round(cell.replace(/[,%]/g,"")*10)/1000;
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

gulp.task("cbpp_shared_lib", function() {
  console.log("No shared CBPP libraries specified in gulpfile");
});

gulp.task('default', ['build']);

return l;

};
