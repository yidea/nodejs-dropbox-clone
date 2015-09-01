/**
 * express.js
 *
 * # run
 * npm start
 * nodemon --exec babel-node --stage 1 -- express.js --dir=/Users/ycao2/walmart/github/nodejs-dropbox-clone
 * http://localhost:3000/
 */
// ----------------------------------------------------------------------------
// Express Server
// ----------------------------------------------------------------------------
let argv = require("yargs").argv;
let fs = require("fs");
let path = require("path");
let _ = require("lodash");
let mkdirp = require("mkdirp");
let rimraf = require("rimraf");
let Promise = require("songbird");
let express = require("express");
let morgan = require("morgan");
let bodyParser = require("body-parser");
let cookieParser = require("cookie-parser");
let methodOverride = require("method-override");
let mime = require("mime-types");
let favicon = require("serve-favicon");
let compression = require("compression");
let archiver = require("archiver");

let Eventbus = require("./utils/eventBus");
let logger = require("./utils/logger");
let fileUtil = require("./utils/fileUtil");
let Constant = require("./constant");
require("./tcpServer");

const HOST = process.env.HOST || "127.0.0.1",
  HTTP_PORT = process.env.PORT || "3000",
  NODE_ENV_PROD = "production",
  NODE_ENV_DEV = "development",
  NODE_ENV = process.env.NODE_ENV || NODE_ENV_DEV,
  DROPBOX_DIR = argv.dir ? argv.dir : path.resolve(process.cwd()); //fallback to current path

// Express setup middleware
let app = express();
app.use(favicon(__dirname + "/public/favicon.ico"));
app.use(express.static("public", {maxage: "24h"})); // static assets, set Etag, maxage
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({extended: true})); // for parsing application/x-www-form-urlencoded w req.body
app.use(methodOverride()); // method override

// Cookie parser should be above session
// cookieParser - Parse Cookie header and populate req.cookies with an object keyed by cookie names
app.use(cookieParser());
app.locals.host = HOST; // init global variables
if (NODE_ENV === NODE_ENV_DEV) {
  app.use(morgan("dev")); // http request logger middleware
} else {
  app.use(compression()); // gzip response for prod
}

// Express middleware
/**
 * setFileStat
 * - set req.stat = fs.stat(req.filePath)
 */
function setFileStat(req, res, next) {
  req.filePath = path.resolve(path.join(DROPBOX_DIR, req.url));
  fs.stat.promise(req.filePath)
    .then((stat) => {
      req.stat = stat;
    })
    .catch((err) => {
      req.stat = null;
    })
    .then(next);
}

/**
 * setDirInfo
 * - set req.isPathDir, req.dirPath, req.bodyText
 */
function setDirInfo(req, res, next) {
  if (req.body) {
    req.bodyText = Object.keys(req.body)[0] || "";
  }
  req.isPathDir = fileUtil.isPathDir(req.filePath);
  req.dirPath = req.isPathDir ? req.filePath : path.dirname(req.filePath);
  next();
}

/**
 * setHeader
 * - set header related common info
 * - dependent on req.stat & req.filePath from setFileStat
 * - if dir: set res.body = list of files
 * - if file: set contentType
 * - set req.stat {} as shared
 * -
 */
function setHeader(req, res, next) {
  if (!req.stat) {
    return next();
  }

  if (req.stat.isDirectory()) {
    // if dir && x-gtar
    if (req.header("Accept") === "application/x-gtar") {
      logger.info("GET: directory zip");

      res.setHeader("Content-Type", "application/zip");
      res.attachment("archive.zip");
      next();
    } else { // if dir: list file in dir
      logger.info("GET: directory list");

      fileUtil.readdirRecursive(req.filePath).then((fileList) => {
        fileList = _.map(fileList, (file) => {
          return file.replace(DROPBOX_DIR, ""); //to relative path
        });
        res.body = fileList;
        res.setHeader("Content-Length", res.body.length);
        res.setHeader("Content-Type", "application/json");
      }).then(next);
    }
  } else { // if file
    logger.info("GET: file");
    res.setHeader("Content-Length", req.stat.size);
    let contentType = mime.contentType((path.extname(req.filePath)));
    res.setHeader("Content-Type", contentType);
    //res.download(req.filePath); //download file w express helper
    let fileStream = fs.createReadStream(req.filePath);
    fileStream.on("error", (err) => {
      res.error = err;
      logger.error(err);
      next();
    });
    fileStream.pipe(res);
    next();
  }
}

// Express routes
/**
 * @GET
 * - Client can make GET requests to get file or directory contents
 curl -v http://127.0.0.1:3000/dropbox -X GET //for get dir list of files
 curl -v http://127.0.0.1:3000/dropbox/package2.json -X GET //for get file
 curl -v -H "Accept:application/x-gtar" http://127.0.0.1:3000/dropbox -X GET //for download archive of dir
 */
app.get("*", setFileStat, setHeader, (req, res) => {
  if (res.err) {
    return res.status(500).send("Something broke!");
  }

  if (req.stat.isDirectory() && req.header("Accept") === "application/x-gtar") {
    let zip = archiver("zip");
    zip.on("error", (err) => {
      logger.error(err);
    });
    zip.on("close", () => {
      return res.status(200).send("ok").end();
    });
    zip.pipe(res);
    zip.bulk([{expand: true, cwd: req.filePath, src: ["**"]}]);
    zip.finalize((err) => {
      if (err) {
        logger.error(err);
      }
    });
  }

  if (res.body) {
    logger.debug(res.body);
    return res.json(res.body);
  }
});

/**
 * @HEAD
 * - Client can make HEAD request to get just the GET headers (Content-Header,Content-Length)
 * - curl -v http://127.0.0.1:3000/dropbox --head
 * - curl -v http://127.0.0.1:3000/dropbox/index2.js --head
 */
app.head("*", setFileStat, setHeader, (req, res) => {
  res.end();
});

/**
 * @PUT
 * - create new directories and files with content
 curl -v http://127.0.0.1:3000/dropbox/foo -X PUT
 curl -v http://127.0.0.1:3000/dropbox/foo/bar.txt -X PUT -d "hello world"
 */
app.put("*", setFileStat, setDirInfo, (req, res) => {
  if (req.stat) {
    logger.error("PUT 405: File/folder exists");
    return res.status(405).send("PUT 405: File/folder exists");
  }

  if (req.isPathDir) { //if new folder
    mkdirp.promise(req.dirPath)
      .then(() => {
        logger.info(`PUT: Folder created ${req.dirPath}`);
        res.end();
      })
      .catch((err) => {
        logger.error(err);
      });
  } else { //if new File
    //TODO: new file under new folder
    fs.writeFile.promise(req.filePath, req.bodyText)
      .then(() => {
        logger.info(`PUT: File created ${req.filePath} content is ${req.bodyText}`);
        res.end();
      })
      .catch((err) => {
        logger.error(err);
      });
  }

  // Notify TCP client: PUT
  Eventbus.emit(Constant.PUT, {
    "type": Constant.PUT,
    "filePath": req.filePath.replace(path.resolve(DROPBOX_DIR, "dropbox"), ""),
    "isPathDir": req.isPathDir,
    "bodyText": req.bodyText,
    "timestamp": Date.now()
  });
});

/**
 * @DELETE
 * - DELETE requests to delete files and folders
 curl -v http://127.0.0.1:3000/dropbox/foo/bar.txt -X DELETE
 curl -v http://127.0.0.1:3000/dropbox/foo -X DELETE
 ls dropbox
 */
app.delete("*", setFileStat, (req, res) => {
  if (!req.stat) { //validate path not exist
    logger.error("DELETE 400: Invalid path");
    return res.status(400).send("DELETE 400: Invalid path");
  }

  if (req.stat.isDirectory()) { //if dir: rimraf
    rimraf.promise(req.filePath)
      .then(() => {
        logger.info(`DELETE: Folder deleted ${req.filePath}`);
        res.end();
      });
  } else { //if file: unlink
    fs.unlink.promise(req.filePath)
      .then(() => {
        logger.info(`DELETE: File deleted ${req.filePath}`);
        res.end();
      });
  }

  // Notify TCP client: DELETE
  Eventbus.emit(Constant.DELETE, {
    "type": Constant.DELETE,
    "filePath": req.filePath.replace(path.resolve(DROPBOX_DIR, "dropbox"), ""),
    "isPathDir": req.stat.isDirectory(),
    "timestamp": Date.now()
  });
});

/**
 * @POST
 * - POST requests to update the contents of a file
 curl -v http://127.0.0.1:3000/dropbox/foo -X POST
 curl -v http://127.0.0.1:3000/dropbox/foo/bar.txt -X POST -d "hello world from POST"
 cat dropbox/foo/bar.txt
 */
app.post("*", setFileStat, setDirInfo, (req, res) => {
  //validate if not exist or folder
  if (!req.stat || req.isPathDir) {
    logger.error("POST 405: File doesn't exist or it's a folder");
    return res.status(405).send("POST 405: File doesn't exist or it's a folder");
  }

  fs.truncate.promise(req.filePath, 0)
    .then(() => {
      fs.writeFile.promise(req.filePath, req.bodyText)
        .then(() => {
          logger.info(`POST: File updated ${req.filePath} content is ${req.bodyText}`);
          res.end();
        });
    });

  // Notify TCP client: POST
  Eventbus.emit(Constant.POST, {
    "type": Constant.POST,
    "filePath": req.filePath.replace(path.resolve(DROPBOX_DIR, "dropbox"), ""),
    "isPathDir": req.isPathDir,
    "bodyText": req.bodyText,
    "timestamp": Date.now()
  });
});

// Start Express server
app.listen(HTTP_PORT);
logger.info(`Express server is running at http://${HOST}:${HTTP_PORT}`);
logger.info(`Folder DIR is ${DROPBOX_DIR}`);

module.exports = app;
