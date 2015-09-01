/**
 * tcpClient
 * - Nssocket TCP client listener
 * npm run client
 */
let fs = require("fs");
let path = require("path");
let mkdirp = require("mkdirp");
let rimraf = require("rimraf");
let Promise = require("songbird");
let nssocket = require("nssocket");
let argv = require("yargs").argv;

let logger = require("./utils/logger");
let Constant = require("./constant");

const ROOT_DIR = argv.dir ? argv.dir : path.join(process.cwd(), "/client");

//let TCPclient = new nssocket.NsSocket({ reconnect: true });
let TCPclient = new nssocket.NsSocket();

// TCP server message listener
// PUT: create
TCPclient.data(["io", Constant.PUT], (data) => {
  logger.debug("PUT", data);

  let filePath = path.resolve(path.join(ROOT_DIR, data.filePath));

  if (data.isPathDir) { //if folder
    mkdirp.promise(filePath).then(() => {
      logger.info(`PUT: Folder created ${filePath}`);
    });
  } else { // file
    fs.writeFile.promise(filePath, data.bodyText).then(() => {
      logger.info(`PUT: File created ${filePath} content is ${data.bodyText}`);
    });
  }
});

// DELETE: remove
TCPclient.data(["io", Constant.DELETE], (data) => {
  logger.debug("DELETE", data);

  let filePath = path.resolve(path.join(ROOT_DIR, data.filePath));

  if (data.isPathDir) { //dir
    rimraf.promise(filePath).then(() => {
      logger.info(`DELETE: Folder deleted ${filePath}`);
    });
  } else { //file
    fs.unlink.promise(filePath).then(() => {
      logger.info(`DELETE: File deleted ${filePath}`);
    });
  }
});

// POST: update
TCPclient.data(["io", Constant.POST], (data) => {
  logger.debug("POST", data);

  let filePath = path.resolve(path.join(ROOT_DIR, data.filePath));
  fs.truncate.promise(filePath, 0).then(() => {
    fs.writeFile.promise(filePath, data.bodyText).then(() => {
      logger.info(`POST: File updated ${filePath} content is ${data.bodyText}`);
    });
  });
});

TCPclient.connect(Constant.TCP_PORT);
logger.info(`TCPclient connected to TCPserver:${Constant.TCP_PORT}`);
logger.info(`Client ROOT_DIR is ${ROOT_DIR}`);

module.exports = TCPclient;
