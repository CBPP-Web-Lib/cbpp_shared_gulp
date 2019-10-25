/*globals process, __dirname*/
var https = require('https');
var http = require("http");
var tls = require("tls");
var fs = require("fs");
var exec = require("child_process").exec;
var sanitize = require("sanitize-filename");
const homedir = require('os').homedir();
process.on("message", function(m) {
  if (typeof(m)==="object") {
    run_server(m.serverPort, m.basedir, m.securePort);
  }
});
function run_server(port, basedir, securePort) {
  var responseCallback = function(req, res) {
    console.log(req.url);
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
      if (file.indexOf("favicon.ico")!==-1) {
        res.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        return;
      }
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
  };

  try {
    try {
      console.log("creating https server on port " + securePort);
      var secureServer = https.createServer({
        SNICallback: function (domain, cb) {
          var file = sanitize(domain);
          console.log(domain, file);
          var key = homedir + "/node-cbpp-ssl/" + file + ".key";
          var cert = homedir + "/node-cbpp-ssl/" + file + ".crt";
          console.log(key);
          if (fs.existsSync(key) && fs.existsSync(cert)) {
            console.log(key);
            cb(null, tls.createSecureContext({
              key: fs.readFileSync(homedir + "/node-cbpp-ssl/" + file + ".key"),
              cert: fs.readFileSync(homedir + "/node-cbpp-ssl/" + file + ".crt")
            }));
          } else {
            cb(null, tls.createSecureContext({
              key: fs.readFileSync(homedir + "/node-cbpp-ssl/localhost.key"),
              cert: fs.readFileSync(homedir + "/node-cbpp-ssl/localhost.crt")
            }));
          }
        },
        key: fs.readFileSync(homedir + "/node-cbpp-ssl/localhost.key"),
        cert: fs.readFileSync(homedir + "/node-cbpp-ssl/localhost.crt")
      }, responseCallback);
      secureServer.on('clientError', function (err, socket) {
        console.log(err);
        socket.end('HTTPS/1.1 400 Bad Request\r\n\r\n');
      });
      secureServer.listen(securePort);
    } catch (ex) {
      console.log("Error creating HTTPS server");
    }
    console.log("creating http server on port " + port);
    var server = http.createServer(responseCallback);

    
    server.on('clientError', function (err, socket) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    });
    server.listen(port);
  
  } catch (ex) {
    process.send({
      "error":ex
    });
  }
}

process.send("ready");