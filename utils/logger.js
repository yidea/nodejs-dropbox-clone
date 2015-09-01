/**
 * logger
 *
 * Add /logs/logs.log file
 */
let winston = require("winston");
let Path = require("path");

const PATH_LOG = "../logs/logs.log";

let logger = new winston.Logger({
  // file log: info, error
  transports: [
    new winston.transports.File({
      level: "info",
      filename: Path.resolve(__dirname, PATH_LOG),
      handleExceptions: true,
      json: true,
      maxsize: 5242880, //5MB
      maxFiles: 5,
      colorize: false
    }),

    // console log: debug, info, error
    new winston.transports.Console({
      level: "debug",
      handleExceptions: true,
      json: false,
      colorize: true
    })
  ],
  exitOnError: false
});

module.exports = logger;
