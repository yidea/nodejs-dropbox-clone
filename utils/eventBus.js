/**
 * eventBus
 */
let events = require("events");
let eventBus = new events.EventEmitter();

module.exports = eventBus;
