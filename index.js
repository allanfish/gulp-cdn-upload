var path = require('path'),
    fs = require("fs"),
    through = require('through2'),
    gutil = require('gulp-util'),
    zip = require('node-native-zip'),
    Promise = require('bluebird'),
    request = require("request"),
    PluginError = gutil.PluginError;

Promise.promisifyAll(fs);

// Consts
const PLUGIN_NAME = 'gulp-cdn-upload';

function cdnUpload(options) {
    var imgExts = ['svg', 'tif', 'tiff', 'wbmp', 'png', 'bmp', 'fax', 'gif', 'ico', 'jfif', 'jpe', 'jpeg', 'jpg', 'woff', 'eot', 'ttf', 'cur'],
        zipBaseDir = null,
        fileMapper = [],
        archive = new zip();

    function transformFile(file, enc, cb) {
        if (file.isNull()) {
            // return empty file
            cb(null, file);
        }
        if (file.isBuffer()) {
            file.contents = Buffer.concat([file.contents]);
        }
        if (file.isStream()) {
            this.emit('error', new PluginError(PLUGIN_NAME, 'Streams are not supported!'));
            return cb();
        }

        if (!zipBaseDir) {
            zipBaseDir = file.base;
        }

        var extname = path.extname(file.path).substring(1);
        var relativePath = file.path.replace(file.base, '/').replace(/\\/g, '/');
        file.domainUrl = options.domain + options.remoteDir + relativePath;

        if (extname === 'html' || extname === 'htm') {
            replaceImgToCdnUrl(file);
            replaceCssJsToCdnUrl(file);
        }
        if (extname === 'css') {
            replaceImgToCdnUrl(file);
        }

        if (imgExts.indexOf(extname) !== -1 || extname === 'css' || extname === 'js') {
            gutil.log("zip relative path: ", path.relative(file.base, file.path));
            fileMapper.push({
                name: path.relative(file.base, file.path),
                path: file.path
            });
        }
        this.push(file);

        var verbose = "";
        verbose += ", base: " + file.base;
        verbose += ", path: " + file.path;
        verbose += ", cwd: " + file.cwd;
        verbose += ", domainUrl: " + file.domainUrl;
        //verbose += ", stat: " + file.stat;
        console.log('file: ', verbose);
        cb(null);
    }

    function _getCdnUrl(relativePath) {
        return options.domain + options.remoteDir + relativePath;
    }

    //替换css中的cdn地址
    function replaceImgToCdnUrl(file) {
        var content = file.contents.toString();

        var reg = /url\(['"\s]*(\.*[\w\-\/\.\s]*)['"\s]*\)/gi;
        var matches = content.match(reg);
        console.log('matches: ', matches);
        content = content.replace(reg, function (match, oriUrl) {
            var imgPath = path.resolve(path.dirname(file.path), oriUrl);
            imgPath = imgPath.replace(/^.*publish/i, '').replace(/\\/g, '/');
            console.log("imgPath: ", imgPath);
            return "url(" + _getCdnUrl(imgPath) + ")";
        });
        file.contents = new Buffer(content);
    }

    function replaceCssJsToCdnUrl(file) {
        var content = file.contents.toString(),
            reg = /(src|href)\s*=\s*['"]+(\.*[\w\-\/\.\s]*\.(?:js|css|png))['"]+/gi,
            filePath;

        console.log(content.match(reg));
        content = content.replace(reg, function (match, p1, p2) {
            if (p2.indexOf('/') === 0) {
                filePath = p2;
            } else {
                filePath = path.resolve(path.dirname(file.path), p2);
                filePath = filePath.replace(/^.*publish/i, '').replace(/\\/g, '/');
            }
            console.log("filePath: ", filePath);
            return p1 + "='" + _getCdnUrl(filePath) + "'";
        });

        file.contents = new Buffer(content);
    }

    function flushFile(cb) {
        gutil.log("start zip files...");
        var zipFile;
        zipFiles().then(function (_zipFile) {
            gutil.log("succes zip files: ", _zipFile);
            zipFile = _zipFile;
            return uploadZipFile(_zipFile);
        }).then(function (body) {
            try {
                gutil.log("success upload those files to cdn: \n\r", Object.keys(JSON.parse(body)));
                fs.unlink(zipFile);
                cb();
            } catch (e) {
                gutil.error(e);
                cb(new Error("parse upload zip file result fail! contact @allanyu"));
            }
        });
    }

    function zipFiles() {
        return new Promise(function (resolve, reject) {
            archive.addFiles(fileMapper, function () {
                var zipName = zipBaseDir + new Date().valueOf() + '.zip';
                fs.writeFileAsync(zipName, archive.toBuffer()).then(function () {
                    resolve(zipName);
                }).catch(reject);
            });
        })
    }

    function uploadZipFile(zipFile) {
        return new Promise(function (resolve, reject) {
            gutil.log("prepare upload zip file: uploadUrl: ", options.uploadUrl, ", zipFile: ", zipFile);

            if (options.remoteDir.substr(-1) === '\/') {
                options.remoteDir = options.remoteDir;
            }

            request.post({
                url: options.uploadUrl,
                formData: {
                    path: options.remoteDir,
                    zip_file: fs.createReadStream(zipFile)
                }
            }, function (err, resp, body) {
                if (err) {
                    console.log("upload failed: ", err);
                    return reject(err);
                }
                resolve(body);
            });
        });
    }

    return through.obj(transformFile, flushFile);

}


/**
 * 打包文件
 */
function zipFiles() {
    // TODO
}

/**
 * 上传文件到CDN代理上传服务器
 */
function uploadFiles() {

}


module.exports = cdnUpload;