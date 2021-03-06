'use strict'

var http = require('http');
var fs = require('fs');
var fse = require('fs-extra');
var path = require('path');
var net = require('net');
var recursive = require('recursive-readdir');
var express = require('express');
var bodyParser = require('body-parser');
var jsonfile = require('jsonfile')
var exec = require('child_process').exec;
var spawn = require('child_process').spawn;
var os = require('os');
var dns = require('dns');
var json = require('format-json');
var Console = require('console').Console;
var colors = require('colors')
var figlet = require('figlet');
var extfs = require('extfs');
var request = require('request');
var concat = require('concat-stream');
var server = require('http').createServer();
var WebSocketServer = require('ws').Server;

if(!fse.existsSync('./config.json')) { //Let ./ and NOT __dirname
    fse.copySync('./examples/config.json', './config.json');//Let ./ and NOT __dirname
};

if(!fse.existsSync(__dirname+'/system')) {
    fse.mkdirsSync(__dirname+'/system')
};

var platform = {};
platform.config = require(__dirname+'/config.json');
platform.middlewares = {};
platform.servers = [];
platform['third-part-servers'] = [];
platform.default_port = 3000; //DEFAULT PORT
if(!platform.config['static-root']) platform.config['static-root'] = 'static'; //DEFAULT STATIC FOLDER

var static_enabled;
var msg = '';
var add_msg = function(txt) {
    msg += '\n'+txt;
};

var middlewares_dir = __dirname+'/middlewares';
var servers_dir = __dirname+'/servers';
var third_part_servers_dir = __dirname+'/servers/third-part-servers';
var static_dir = __dirname+'/static';
var routes_dir = __dirname+'/routes';
var use_dir = __dirname+'/use';

var app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var DISPLAY_FLAG = (process.argv[2] !== 'false') ? true : false;
var display = function(name,callback, title) {
    
    var font = (title) ? 'Standard' : 'Digital';
    figlet(name, font, function(err, ascii) {
        if (err) {
            log('Something went wrong...');
            error(err);
            return;
        }

        if(title && DISPLAY_FLAG !== false) { 
            name = ascii;
        }

        //setTimeout(function() {
            if(name) console.log(name)
            if(callback) callback();
        //});

    });
}

//Logs
var logStream = fs.createWriteStream(__dirname+'/system/inode.log');
var logger = new Console(logStream,logStream);
var log = function() {
    logger.log('['+new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')+']',colors.green.apply(true,arguments));
}
var warn = function() {
    logger.warn('['+new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')+']',colors.yellow.apply(true,arguments));
}
var error = function() {
    logger.error('['+new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '')+']',colors.red.apply(true,arguments));
}

if(DISPLAY_FLAG !== false) {
    figlet('Host config', 'Standard', function(err, ascii) {
        if (err) {
            log('Something went wrong...');
            error(err);
            return;
        }

        console.log(ascii)

            //Informations on host
            console.log(colors.white.bold('FREEMEMORY ...'+os.freemem()));
        console.log(colors.white.bold('HOMEDIR ...' + os.homedir()));
        console.log(colors.white.bold('HOSTNAME ...' + os.hostname()));
        console.log(colors.white.bold('NETWORK-INTERFACES ...' + json.plain(os.networkInterfaces())));
        console.log(colors.white.bold('ARCH ...'+os.arch()));
        //console.log(colors.white.bold('CONSTANTS ...'+ json.plain(os.constants)));
        console.log(colors.white.bold('PLATFORM ...'+os.platform()+'#'+os.release()));
        console.log(colors.white.bold('TMPDIR ...'+os.tmpdir()));
        console.log(colors.white.bold('UPTIME ...'+os.uptime()));
        console.log(colors.white.bold('CURRENT DNS ...'+dns.getServers()));
    });
}

//Require user middlewares
var middlewares = [];
fs.access(middlewares_dir, fs.F_OK, function(err) {
    if (!err) {
        fs.readdir(middlewares_dir, function(err, items) {
            for (var i=0; i<items.length; i++) {
                if(path.extname(items[i]) === '.js') {
                    var item = items[i];
                    middlewares.push(items[i]);
                    try {
                        platform.middlewares[path.basename(item,'.js')] = require(middlewares_dir+'/'+item);
                        log('Success [require middleware "'+item+'"] ');
                    } catch (e) {
                        error('Failure [require middleware "'+item+'"] '+e);
                        display('Middleware', function() {
                            console.log(colors.red("Middleware error : "+middlewares.shift()));
                            console.log(colors.red("Middleware error : "+e));
                        });
                    }
                }
            }
        });
    }
});

//Require routes
var routes = [];
fs.access(routes_dir, fs.F_OK, function(err) {
    if (!err) {
        fs.readdir(routes_dir, function(err, items) {
            for (var i=0; i<items.length; i++) {
                if(path.extname(items[i]) === '.js') {
                    var item = items[i];
                    routes.push(items[i]);
                    try {
                        require(routes_dir+'/'+item)(app,platform.config,platform.middlewares);
                        log('Success [require route "'+item+'"] ');
                    } catch (e) {
                        error('Failure [require route "'+item+'"] '+e);
                        display('Route', function() {
                            console.log(colors.red("Route error : "+routes.shift()));
                            console.log(colors.red("Route error : "+e));
                        });
                    }
                }
            }
        });
    }
});

//Starts third-part-servers
if(platform.config && platform.config['third-part-servers']) {
    fs.access(third_part_servers_dir, fs.F_OK, function(err) {
        if (!err) {
            fs.readdir(third_part_servers_dir, function(err, items) {
                for (var i=0; i<items.length; i++) {
                    var item = items[i];
                    if(platform.config['third-part-servers'].indexOf(item) > -1){
                        log('Launching third-part server "'+item+'" (unknown port, look in "'+third_part_servers_dir+'/'+item+'")');
                        exec('node '+third_part_servers_dir+'/'+item, function (err, stdout, stderr) {
                            if(err) {
                                error('Failure [exec third-part server "'+item+'"] '+err);
                                console.log(colors.red('Failure [exec third-part server "'+item+'"] '));
                            }
                        });
                    }
                }
            });
        }
    });
}

//Starts sub-servers
if(platform.config && platform.config.servers) {
    fs.access(servers_dir, fs.F_OK, function(err) {
        if (!err) {
            fs.readdir(servers_dir, function(err, items) {
                var cmd = {};
                for (var i=0; i<items.length; i++) {
                    if(platform.config.servers[items[i]]) {
                        var item = items[i];
                        exec('node '+servers_dir+'/'+item+'/app.js '+false, function (err, stdout, stderr) {
                            if(err) throw(err);
                        });
                        setTimeout(function() {
                            display(colors.yellow('Started inode "'+item+'" at address '+platform.config.servers[item]));
                        },500);
                    }
                }

            });
        } else {
            throw(err);
        }
    });
}

function start() {

    //Link the server to the express app
    server.on('request', app);

    //Configure the websocket (http upgrade)
    var clients = [];
    var wss = new WebSocketServer({server:server});
    add_msg(colors.green('Websocket active at address localhost:'+ platform.config.port));

    wss.on('connection', function(ws) {
        clients.push(ws);
        ws.on('message', function(message) {
            ws.send("Hello, I'm Marvin. I'm still in development.");//TODO
        });
    });

    wss.on('open', function(ws) {
	  console.log("Marvin is active.");
    });

    wss.on('error', function(error) {
	  //throw("Marvin encounter a connectivity problem."); //TODO could not test it at time of coding
    });

    //Start the http server 
    server.listen(platform.config.port, function() {
        log('Started inode "'+platform.config.name+'" at address localhost:'+ platform.config.port);
        log('Websocket active at address localhost:'+ platform.config.port);
        console.log(msg);
    });

}

//Enable static content
extfs.isEmpty(static_dir, function (empty) {
    display(null, function() {
        add_msg('Inode found : '+platform.config.name);

        if(!platform.config.port) {
            add_msg(colors.yellow('No port specified in config, default port is '+platform.default_port));
            platform.config.port = platform.default_port; 
        }

        add_msg(colors.green('Started inode "'+platform.config.name+'" at address localhost:'+ platform.config.port));
        display(null, function() {
            if(platform.config['static-content-enabled'] === 'true') {
                static_enabled = true;
            } else {
                static_enabled = false;
            }

            if (!static_enabled){
                log("Static content is deactivated. No static content served");
                add_msg(colors.green("Static content is deactivated. No static content served"));
            } else if(empty && static_enabled) {
                warn("Static content is activated but Static folder is empty. No static content served from "+static_dir);
                add_msg(colors.yellow("Static content is activated but Static folder is empty. No static content served from "+static_dir));
            } else {
                app.use(express.static(path.resolve(__dirname,platform.config['static-root']), {
                    index: platform.config['static-entry-point']
                })); //serve a static app
                log("Static content is served from "+platform.config['static-root']);
                add_msg(colors.green("Static content is served from "+platform.config['static-root']));
            }

            fs.access(__dirname+'/../../config.json', fs.F_OK, function(err) {
                if (!err) {
                    var _config = require(__dirname+'/../../config.json');
                    if(_config.servers && _config.servers[platform.config.name]) {
                        platform.config.port = _config.servers[platform.config.name].split(':')[1];
                        jsonfile.writeFile(__dirname+'/config.json', platform.config, {spaces: 2}, function(err) {
                            if(err) error('Failure [write config]"] '+err);
                            start();
                        })
                    } else {
                        start();
                    }
                } else {
                    start();
                }

            });
        });
    });
});

