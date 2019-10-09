/*globals process*/
var http = require('http');
var fs = require("fs");
var exec = require("child_process").exec;

process.on("message", function(m) {
  if (typeof(m)==="object") {
    run_server(m.serverPort, m.basedir);
  }
});

function run_server(port, basedir) {
  try {
    console.log("starting http server on port " + port);
    var serverPort = port;
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
          'Access-Control-Allow-Methods':'POST, GET, OPTIONS',
          'Cache-Control':'no-cache'
        };
        var file = req.url.split("?")[0];
        if (fs.lstatSync("./build" + file).isDirectory()) {
          if (file.slice(-1)!=="/") {
            res.writeHead(301, {'Location': file + "/"});
            res.end();
            return;
          }
          file += "/index.php";
          if (!fs.existsSync("./build" + file)) {
            file = file.replace("index.php","index.html");
          }
        }
        var ext = file.split(".")[file.split(".").length-1];
        if (ext==="php") {
          var command = "php-cgi \"" + basedir + "/build" + file + "\" ";
          var url_arr = req.url.split("?");
          if (url_arr[1]) {command += url_arr[1].split("&").join(" ");}
          exec(command, {encoding:"Buffer"}, function(err, f) {
            var parsed = parse_php_res(f);
            try {
              res.writeHead(200, parsed.headers);
              res.write(parsed.body);
              res.end();
            } catch (ex) {
              console.log("Invalid headers");
              console.log(parsed.headers);
            }
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
        console.log(ex);
        res.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      }
    });
    server.on('clientError', function (err, socket) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });
    server.listen(serverPort);
  
  } catch (ex) {
    process.send({
      "error":ex
    });
  }
}

process.send("ready");