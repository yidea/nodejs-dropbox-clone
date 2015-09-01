/**
 * tcpServer
 * - Nssocket TCP server: Allow clients to connect and synchronize a directory via TCP sockets
 */
let fs = require("fs");
let nssocket = require("nssocket");
let chokidar = require("chokidar");
let path = require("path");
let Promise = require("songbird");

let Constant = require("./constant");
let logger = require("./utils/logger");
let Eventbus = require("./utils/eventBus");

const DROPBOX_DIR = path.resolve(process.cwd());

let TCPserver = nssocket.createServer((socket) => {
  // setup TCP message events for CRUD
  Eventbus.on(Constant.PUT, (data) => {
    socket.send(["io", Constant.PUT], data);
  });

  Eventbus.on(Constant.POST, (data) => {
    socket.send(["io", Constant.POST], data);
  });

  Eventbus.on(Constant.DELETE, (data) => {
    socket.send(["io", Constant.DELETE], data);
  });

  // File watcher at dropbox folder, ignored dot file
  // touch -d '14 May' test.txt
  let watcher = chokidar.watch(path.resolve(process.cwd(), "dropbox"), {ignored: /[\/\\]\./});
  watcher
    .on("add", (filePath) => { //add file
      logger.debug("Add file", filePath);

      fs.readFile.promise(filePath, "utf8").then((text) => {
        Eventbus.emit(Constant.PUT, {
          "type": Constant.PUT,
          "filePath": filePath.replace(path.resolve(DROPBOX_DIR, "dropbox"), ""),
          "isPathDir": false,
          "bodyText": text,
          "timestamp": Date.now()
        });
      });
    })
    .on("change", (filePath) => { //update file
      logger.debug("Update file", filePath);

      fs.readFile.promise(filePath, "utf8").then((text) => {
        Eventbus.emit(Constant.POST, {
          "type": Constant.POST,
          "filePath": filePath.replace(path.resolve(DROPBOX_DIR, "dropbox"), ""),
          "isPathDir": false,
          "bodyText": text,
          "timestamp": Date.now()
        });
      });
    })
    .on("addDir", (filePath) => { //add dir
      logger.debug("Add dir", filePath);

      Eventbus.emit(Constant.PUT, {
        "type": Constant.PUT,
        "filePath": filePath.replace(path.resolve(DROPBOX_DIR, "dropbox"), ""),
        "isPathDir": true,
        "timestamp": Date.now()
      });
    })
    .on("unlink", (filePath) => { //delete file
      logger.debug("delete file", filePath);

      Eventbus.emit(Constant.DELETE, {
        "type": Constant.DELETE,
        "filePath": filePath.replace(path.resolve(DROPBOX_DIR, "dropbox"), ""),
        "isPathDir": false,
        "timestamp": Date.now()
      });
    })
    .on("unlinkDir", (filePath) => { //delete folder
      logger.debug("delete folder", filePath);

      Eventbus.emit(Constant.DELETE, {
        "type": Constant.DELETE,
        "filePath": filePath.replace(path.resolve(DROPBOX_DIR, "dropbox"), ""),
        "isPathDir": true,
        "timestamp": Date.now()
      });
    });
});

TCPserver.listen(Constant.TCP_PORT, () => {
  logger.info(`TCPserver is running on :${Constant.TCP_PORT}`);
});

module.exports = TCPserver;
