const express = require('express');
const app = express();
const fs = require('fs');
const winston = require('winston');
const st = require('st');
const path = require('path');
const rl = require('express-rate-limit');
const bodyParser = require('body-parser');
const DocumentHandler = require('./lib/document_handler');
const util = require('./lib/util');

// Load the configuration and set some defaults
const config = JSON.parse(fs.readFileSync(process.cwd() + '/config.js', 'utf8'));
config.port = process.env.PORT || config.port || 7777;
config.host = process.env.HOST || config.host || 'localhost';

// Set up the logger
if (config.logging) {
  try {
    winston.remove(winston.transports.Console);
  } catch(e) {
    /* was not present */
  }

  let detail, type;
  for (let i = 0; i < config.logging.length; i++) {
    detail = config.logging[i];
    type = detail.type;
    delete detail.type;
    winston.add(winston.transports[type], detail);
  }
}

// build the store from the config on-demand - so that we don't load it
// for statics
if (!config.storage) {
  config.storage = { type: 'file' };
}
if (!config.storage.type) {
  config.storage.type = 'file';
}

let Store, preferredStore;

if (process.env.REDISTOGO_URL && config.storage.type === 'redis') {
  let redisClient = require('redis-url').connect(process.env.REDISTOGO_URL);
  Store = require('./lib/document_stores/redis');
  preferredStore = new Store(config.storage, redisClient);
}
else {
  Store = require('./lib/document_stores/' + config.storage.type);
  preferredStore = new Store(config.storage);
}

// Compress files or not
util.recompressStaticAssets(winston);

// Send the static documents into the preferred store, skipping expirations
let path_, data;
for (let name in config.documents) {
  path_ = config.documents[name];
  data = fs.readFileSync(path_, 'utf8');
  winston.info('loading static document', { name: name, path: path_ });
  if (data) {
    preferredStore.set(name, data, function(cb) {
      winston.debug('loaded static document', { success: cb });
    }, true);
  }
  else {
    winston.warn('failed to load static document', { name: name, path: path_ });
  }
}

// Pick up a key generator
let pwOptions = config.keyGenerator || {};
pwOptions.type = pwOptions.type || 'random';
let gen = require('./lib/key_generators/' + pwOptions.type);
let keyGenerator = new gen(pwOptions);

// Configure the document handler
let documentHandler = new DocumentHandler({
  store: preferredStore,
  maxLength: config.maxLength,
  minLength: config.minLength,
  keyLength: config.keyLength,
  keyGenerator: keyGenerator
});

// Setup ratelimits
const limiter = rl({
  windowMs: config.ratelimit.time * 60 * 1000,
  max: config.ratelimit.requests,
  message: { error: 'Please slow down!' }
});
// Hide express is running and allow COR
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'Hastebin/Server');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});
// Static assets, Rate Limits and parse text
app.use(express.static('static'));
app.use(limiter);
app.use(bodyParser.text());

// Main endpoints
app.get('/raw/:id', function(request, response) {
  return documentHandler.handleRawGet(request, response, config);
});

app.head('/raw/:id', function(request, response) {
  return documentHandler.handleRawGet(request, response, config);
});

// add documents

app.post('/documents', function(request, response) {
  return documentHandler.handlePost(request, response, config);
});

// get documents
app.get('/documents/:id', function(request, response) {
  return documentHandler.handleGet(request, response, config);
});

app.head('/documents/:id', function(request, response) {
  return documentHandler.handleGet(request, response, config);
});

// load any key
app.get('/:id', function(request, response) {
  return response.sendFile(path.join(__dirname + '/static/index.html'));
});

// Match  any other static file
app.use(st({
  path: __dirname + '/static',
  content: { maxAge: config.staticMaxAge },
  passthrough: true,
  index: false
}));

// Main page
app.use(st({
  path: __dirname + '/static',
  content: { maxAge: config.staticMaxAge },
  index: 'index.html'
}));

app.listen(config.port, config.host); 
winston.info('listening on ' + config.host + ':' + config.port);
