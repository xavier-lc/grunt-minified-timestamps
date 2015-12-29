/* global module, require */

var fs = require('fs');
var chalk = require('chalk');

module.exports = function (grunt, options) {
    'use strict';

    /**
     * Get the asset info, specifically the last modified time and its
     * contents, if the file exists
     *
     * @param {String} path The path of an asset file
     *
     * @returns {Object|null} NULL if the file was not found. If so, an object with "mtime"
     * ({Date} Time when file data last modified), "content" (file content),
     * and "realPath" (the parent minified file path) properties
     */
    var getInfo = function (path) {
        var stats;
        var content;

        var assetPath = resolveAssetPath(path);

        // remove the timestamp (if there's one) to check if the parent file has been updated on the minification tasks
        var realPath = assetPath.replace(/min\.\d+\./, 'min.');

        // try/catch because an exception is thrown for files not found
        try {
            // get file info
            stats = fs.statSync(realPath);

            // be sure that the timestamped file exists
            if (!grunt.file.exists(assetPath)) {
                // abort immediately if an asset is not found
                grunt.fatal('Asset not found: ' + assetPath + '. Check that the timestamp on the template matches the one on the file system', 3);
            }

            // get file contents
            content = grunt.file.read(realPath);

            return {
                mtime: stats.mtime,
                content: content,
                realPath: realPath
            };
        } catch (e) {
            // file not found (external scripts, f. ex.)
            // check if the file not found is external (with a path like //www.example.com...)
            var external = /^\/\//.test(realPath);

            if (external) {
                grunt.log.writeln('  - No info for external file: ' + chalk.yellow(realPath));

                return null;
            } else {
                // abort immediately if an asset is not found
                grunt.fatal('File not found: ' + realPath, 3);
            }
        }
    };

    /**
     * Tell whether an asset is external to the file system, checking if it starts by "http", "https", or "//"
     *
     * @param {String} path
     * @returns {boolean}
     */
    var isExternal = function (path) {
        return /^(http(s)?:)?\/\//.test(path);
    };

    /**
     * If the asset path is a helper call used on the symfony templates (e.g. {{ asset('relative/file/path') }}),
     * get the real path out of it. Otherwise, return the path as it is
     *
     * @param {String} path
     * @returns {String}
     */
    var getPathFromSymfonyAssetCall = function (path) {
        var result = /^{{\s*asset\(['"](.+)['"]\)\s*}}$/i.exec(path);

        if (result === null) {
            return path;
        }

        return result[1];
    };

    /**
     * Translate the asset path found on the template, to the path relative to the Gruntfile. Ignore external files
     * and get the asset path from symfony helper calls if needed
     *
     * @param {String} path The asset path as found on the template
     * @returns {String} The real asset path on the filesystem (relative to the Grunfile)
     */
    var resolveAssetPath = function(path) {
        // external files don't need to be resolved
        if (isExternal(path)) {
            return path;
        }

        var cleanPath = getPathFromSymfonyAssetCall(path);

        // add the asset path and make sure there are no double slashes
        // (happens when the asset is declared like src="/file.ext")
        return (options.assetPath + cleanPath).replace('//', '/');
    };

    /**
     * Return the details of a file
     *
     * @param {String} path
     * @returns {Object}
     */
    var details = function (path) {
        var realPath = resolveAssetPath(path);

        var lastSlash = realPath.lastIndexOf('/');

        var dir = realPath.substr(0, lastSlash);
        var file = realPath.substr(lastSlash + 1);

        var lastDot = file.lastIndexOf('.');

        // remove the extension and the timestamp
        var fileWoutExtension = file.substr(0, lastDot).replace(/min\.\d+/, 'min');
        var extension = file.substr(lastDot + 1);

        var timestamp = Date.now();

        var tplRegExp = new RegExp(
            realPath.replace(options.assetPath, '')
        );

        return {
            dir: dir,
            fileWoutExtension: fileWoutExtension,
            uglified: dir + '/' + fileWoutExtension + '.' + extension,
            extension: extension,
            oldPath: realPath,
            newPath:  dir + '/' + fileWoutExtension + '.' + timestamp + '.' + extension,
            tplRegExp: tplRegExp
        };
    };

    /**
     * Delete previous versions (file.min.123.js) of a given minified file (file.min.js)
     *
     * @param {Object} file
     */
    var deleteOld = function (file) {
        var regex = new RegExp(
            file.dir + '\/' + file.fileWoutExtension.replace('.', '\\.') + '\\.\\d+\\.' + file.extension
        );

        grunt.file.recurse(file.dir, function (abspath, rootdir, subdir, filename) {
            if (regex.test(abspath)) {
                grunt.log.writeln('    - Deleting old timestamped file: ' + chalk.red(abspath));

                grunt.file.delete(abspath);
            }
        });
    };

    /**
     * Make a timestamped copy of the uglified file
     *
     * @param {Object} file
     */
    var timestamp = function (file) {
        grunt.file.copy(file.uglified, file.newPath);
    };

    return {
        details: details,
        getInfo: getInfo,
        deleteOld: deleteOld,
        timestamp: timestamp,
        // only returned for testing purposes
        resolveAssetPath: resolveAssetPath
    };
};
