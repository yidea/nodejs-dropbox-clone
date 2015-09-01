/**
 * fileUtil
 *
 * # run
 * nodemon --exec babel-node --stage 1 -- utils/fileUtil.js
 */
let fs = require("fs");
let path = require("path");
let Promise = require("songbird");
let _ = require("lodash");
let logger = require("./logger");

let FileUtil = {
  /**
   * readdirRecursive("path/to/fileordir").then()
   * - List file & sub-dir recursively, output as array of files w absolute path
   * - e.g. /Users/ycao2/walmart/github/nodejs-dropbox-clone/dropbox
   */
  readdirRecursive: (dirName) => {
    if (!dirName) { throw new Error("dirname is required"); }

    return fs.readdir.promise(dirName) //shallow readdir of path
      .map((fileName) => { //bluebird .map(item) return [], item is resolved value of promise
        fileName = path.join(dirName, fileName); // ensure absolute path
        return fs.stat.promise(fileName).then((stat) => {
          return stat.isFile() ? fileName : FileUtil.readdirRecursive(fileName);
        });
      })
      .reduce((a, b) => {
        return a.concat(b);
      }, []) // flatten array, init value []
      .catch((err) => { //handle dirName is file case
        return fs.stat.promise(dirName).then((stat) => {
          if (stat.isFile()) { return dirName; }
        });
      });
  },

  /**
   * isPathDir("/user/folder/subfolder/")
   * - detect path is dir based on / or not has extension
   */
  isPathDir: (filePath) => {
    if (!filePath || !_.isString(filePath)) {
      throw new Error("filePath invalid");
    }
    //if last char is / or no ext
    if (_.last(filePath) === path.sep || !path.extname(filePath)) {
      return true;
    }
    return false;
  }

};

// Test
//FileUtil.readdirRecursive("/Users/ycao2/walmart/github/nodejs-dropbox-clone/dropbox/", true).then((fileList) => {
//  console.log(fileList.join("\n"));
//});

module.exports = FileUtil;
