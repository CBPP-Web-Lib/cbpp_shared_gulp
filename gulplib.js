/*globals require, console, Buffer, Promise*/
var gulp = require('gulp'),
    gutil = require('gulp-util'),
    sass = require('gulp-sass'),
    uglify = require('gulp-uglify'),
    watch = require('gulp-watch'),
    concat = require('gulp-concat'),
    notify = require('gulp-notify'),
    browserify = require('browserify'),
    browserify_css = require('browserify-css'),
    source = require("vinyl-source-stream"),
    sourcemaps = require('gulp-sourcemaps'),
    buffer = require('vinyl-buffer'),
    watchify = require('watchify'),
    stringify = require('stringify'),
    fs = require("fs"),
    text_encoding = require("text-encoding"),
    parser = require("csv-parse"),
    git = require("gulp-git"),
    exec = require('child_process').exec;
    //pako = require("pako");

function swallowError(error) {
    console.log(error.toString());
    this.emit('end');
}

function copyIndex() {
  fs.createReadStream('./index.html').pipe(fs.createWriteStream('./build/index.html'));
}

function get_cbpp_shared_lib(name, cb) {
  git.clone("https://github.com/CenterOnBudget/" + name, function(err) {
    if (err) {
      if (err.code===128) {
        console.log("CBPP_Figure already exists");
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

gulp.task('build-watch', ['sass', 'buildDirectory'], function() {
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

gulp.task('build', ['sass', 'buildDirectory'], function() {
  var b = doBrowserify("./app.js");
  return b
    .doBundle()
    .doUglify()
    .writeBundle();
});

function defaultDataHandler(f_cb) {
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

gulp.task('default', ['build']);
