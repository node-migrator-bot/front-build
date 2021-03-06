var _ = require('underscore');
var iconv = require('iconv-lite');
var fs = require('fs');
var path = require('path');
var async = require('async');
var fu = require('./fileutil');

/**
 * Page Class
 * @param  {Object} cfg config
 *     cfg.name {String} name of page
 *     cfg.rootDir {String} source code
 *     cfg.version      {String} where builded source goto.
 *     cfg.inputCharset   {String} charset of source code
 *     cfg.outputCharset  {String} build charset. 
 */
var Page = module.exports = function(cfg) {
    var self = this;
    self.app = cfg.app || null;
    self.name = cfg.name;

    self.rootDir = path.resolve(cfg.rootDir);

    self.config = {
        inputCharset: 'utf8',
        outputCharset: 'utf8'
    };

    self._plugins = [];

    self.srcDir = path.resolve(self.rootDir, Page.TEMP_SOURCE_NAME);
    self.destDir = path.resolve(self.rootDir, Page.destDir);
    self.charset = 'utf8';

}

_.extend(Page, {
    TEMP_SOURCE_NAME: 'page_src_temp',
    destDir: 'page_build_temp',
    JSON_NAME: 'fb.page.json',
    BUILD_SH: 'fb-build.sh',
    BUILD_BAT: 'fb-build.bat',
    BUILD_JSON_NAME: 'build.json',
    DIRS: ['core', 'mods', 'test'],
    parsePageVersion: function (page_version) {
        var pvReg = /^(\w[\w\-~]*)[@/\\](\d+(\.\d+)+)$/;
        var match = pvReg.exec(page_version);

        if (!match) {
            return null;
        }

        return {
            pageName: match[1],
            version: match[2]
        }

        return obj;
    }
});

_.extend(Page.prototype, {

    addVersion: function (version, callback) {
        var self = this;
        if (!self.rootDir) {
            console.error('不在Page文件夹内！')
            return callback(new Error('Page#addVersion: no page'));
        }
        if (!version) {
            console.error("必须指定一个version: fb version {version}")
            process.exit(3);
        }

        if (!/^(\d+\.)+\d+$/.test(version)) {
            console.error("version 格式错误。期望的格式是 1.0")
            return callback(new Error('version not illegal'));
        }

        var versionDir = self.versionDir = path.resolve(self.rootDir, version);

        var pageInfo = {
            name: self.name, 
            version: version
        };
        
        var jsonfile = path.resolve(versionDir, Page.JSON_NAME);

        async.series([
            function (callback) {
                // mkdir pageRoot
                path.exists(versionDir, function (exist) {
                    if (exist) {
                        console.log('version directory exist');
                        return callback(null);
                    }
                    fs.mkdir(versionDir, callback);
                });
            },

            function (callback) {
                //mkdir s
                self._initDirs(versionDir, callback);
            },

            function (callback) {
                //write config json
                
                path.exists(jsonfile, function(exist) {

                    if (!exist) {
                        fu.writeJSON(jsonfile, self.config, callback);
                        return;
                    }
                    
                    fu.readJSON(jsonfile, function(err, pagejson){
                        if (err) {
                            console.log('fb.page.json 文件存在，不过JSON格式好像不正确，请更正后继续添加。');
                            return callback(new Error('JSON Format Error;'))
                        }
                        self.config = _.defaults(pagejson, self.confg);
                        fu.writeJSON(jsonfile, self.config, callback);
                    });
                    

                })
            },

            function (callback) {
                //write config json
                fu.writeJSON(jsonfile, self.config, callback);
            },


            function (callback) {
                //write sh file
                var filepath = path.resolve(versionDir, Page.BUILD_SH);
                var template = _.template('#!/bin/sh\nfb build <%= name%>/<%= version%> -t 000000');
                path.exists(filepath, function(exist){
                    if(exist) {
                        console.log('%s exist, passed;', Page.BUILD_SH);
                        return callback(null);
                    }
                    fs.writeFile(filepath, template(pageInfo), function (err) {
                        if (err) {
                            return callback(err);
                        }
                        fs.chmod(filepath, '0777', callback);
                    });
                    
                });
            },

            function (callback) {
                //write bat file
                var filepath = path.resolve(versionDir, Page.BUILD_BAT);
                var template = _.template('fb build <%= name%>@<%= version%> -t 000000')

                path.exists(filepath, function(exist){
                    if(exist) {
                        console.log('%s exist, passed;', Page.BUILD_BAT);
                        return callback(null);
                    }
                    fs.writeFile(filepath, template(pageInfo), function (err) {
                        if (err) {
                            return callback(err);
                        }
                        fs.chmod(filepath, '0777', callback);
                    });
                    
                });
            }

        ], callback);
    },

    /**
     * Page can build only after setVersion
     * @param  {Function} callback with (null)
     * @return {[type]}            [description]
     */
    setVersion: function (version, callback) {
        var self  = this;
        self.version = version;
        self.name_version = self.name + '@' + self.version;
        self.versionDir = path.resolve(self.rootDir, self.version);

        path.exists(self.versionDir, function(exist){
            if (!exist) {
                return callback(new Error('Page#setVersion: ' + self.name + '@' + version +' is not exist'));
            }

            fu.readJSON(path.resolve(self.versionDir, Page.JSON_NAME), function (err, json) {
                if (err) {
                    return callback(err);
                }
                _.extend(self.config, json);

                self.input_charset = self.config.inputCharset || self.charset;
                self.output_charset = self.config.outputCharset || self.charset;

                self._loadPlugins(callback);
            });
        });
    },
    /**
     * update prev version of fb version to current;
     * @return {[type]} [description]
     */
    updateVersion: function(callback) {
        //TODO
    },

    _initDirs: function(versionDir, callback) {
        async.forEach(
            Page.DIRS, 
            function (name, callback){
                var dir = path.resolve(versionDir, name);
                path.exists(dir, function (exist) {
                    if (exist) {
                        console.log('%s exists; passed', name);
                        return callback(null);
                    }
                    fs.mkdir(dir, callback)
                })
            }, 
            callback
        );
    },

    _loadPlugins: function(callback) {
        var self = this;

        self.use(require('./plugins/module-compiler')({
            base: 'core'
        }));

        self.use(require('./plugins/css-combo')({
            base: 'core'
        }));

        self.use(require('./plugins/lesscss')({
            base: 'core'
        }));

        self.use(require('./plugins/concat')());
        
        self.use(require('./plugins/uglifyjs')({
            base: 'core'
        }));
        self.use(require('./plugins/cssmin')({
            base: 'core'
        }));

        callback(null);
    },

    build: function(timestamp, callback) {
        var self = this;
        
        if (!self.version) {
            return callback(new Error('Page#build: version is not setted; '));
        }

        if (!timestamp) {
            return callback(new Error('Page#build: timestamp missing'))
        }

        self.timestamp = timestamp;
        self.timestampDir = path.resolve(self.rootDir, timestamp.toString());
        var startTime = new Date();

        async.series([
            function (callback){
                //准备工作
                self._startBuild(callback);
            },
            function (callback){
                self._build(callback);
            },
            function (callback) {
                //扫尾工作
                self._endBuild(startTime, callback);
            },

        ], callback);
    },

    _build: function(callback) {
        var self = this;
        
        async.forEachSeries(self._plugins, function(plugin, callback) {
            plugin(self, callback);
        }, callback);
        
    },

    _startBuild: function(callback) {
        var self = this;

        console.log('building %s to %s', self.name_version, self.timestamp);

        // make tempdir
        async.series([
            function (callback) {
                //make temp src and dest dirs
                async.forEach(
                    [self.srcDir, self.destDir],
                    self._makeTempDir,
                    callback
                );
            },

            function (callback) {
                //copy and conv charset from version to src dir
                console.log(self.input_charset, self.charset);
                fu.iconv({
                    from: {
                        path: self.versionDir,
                        charset: self.input_charset
                    },
                    to: {
                        path: self.srcDir,
                        charset: self.charset
                    }
                }, callback);
            },

            function (callback) {
                //create timestamp dir
                var timestampDirs = [self.timestampDir, path.resolve(self.timestampDir, 'core')];

                async.forEachSeries(timestampDirs, function (p, callback){
                    path.exists(p, function (exist){
                        if (exist) {
                            return callback();
                        }

                        fs.mkdir(p, callback);
                    });

                }, callback);
            },
        ], callback);
    },

    _endBuild: function(startTime, callback) {
        console.log('build end');
        var self = this;
        // change charset to target charset and move to target
        fu.iconvDir(self.destDir, self.charset, self.timestampDir, self.output_charset);
        // remove tempdir
        [self.srcDir, self.destDir].forEach(function(dir) {
            fu.rmTreeSync(dir);
        });

        fu.writeJSON(path.resolve(self.timestampDir, Page.BUILD_JSON_NAME), {
            build_version: self.version,
            build_time: new Date().toString(),
            build_used_time: new Date().getTime() - startTime.getTime()
        }, callback);
    },

    _makeTempDir: function(dir_name, callback) {

        if (path.existsSync(dir_name)) {
            fu.rmTreeSync(dir_name);
        }

        fs.mkdir(dir_name, callback);
    },
    /**
     * add plugin to Page
     * @param  {Object} plugin the Page Plugins
     * @return {[type]}        [description]
     */
    use: function(plugin) {
        var self = this;

        if (typeof plugin !== 'function') {
            return;
        }
        if (!self._plugins) {
            self._plugins = [];
        }

        self._plugins.push(plugin);
        
    }
});