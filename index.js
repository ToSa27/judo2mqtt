#!/usr/bin/env node

const pkg = require('./package.json')
const log = require('yalm')
const config = require('./config.js')
const mqtt = require('mqtt')
const request = require('request-promise-native');

var mqttClient;
var judoconnected = false;

function start () {
  log.setLevel(config.verbosity)
  log.info(pkg.name + ' ' + pkg.version + ' starting')

  // MQTT Stuff
  // Define the will message (is send on disconnect).
  const mqttOptions = {
    will: {
      topic: config.name + '/connected',
      message: 0,
      qos: 0,
      retain: true
    }
  }

  mqttClient = mqtt.connect(config['mqtt-url'], mqttOptions)

  mqttClient.on('connect', () => {
    log.info('Connected to mqtt %s', config['mqtt-url'])
    mqttClient.subscribe(config.name + '/set/+/+')
    mqttClient.subscribe(config.name + '/cmd/+')
  })

  mqttClient.on('message', handleIncomingMessage)

  mqttClient.on('close', () => {
    log.info('mqtt closed ' + config.mqtt)
  })

  mqttClient.on('error', err => {
    log.error('mqtt', err.toString())
  })

  mqttClient.on('offline', () => {
    log.error('mqtt offline')
  })

  mqttClient.on('reconnect', () => {
    log.info('mqtt reconnect')
  })

  log.debug('Connecting to Judo');
  judoLogin()
  .then(() => {
    judoconnected = true;
  })
  .catch((err) => {
  });

  judoEventsInterval = setInterval(() => {
    if (judoDevices)
      if (judoDevices.length > 0)
        judoCheckEvents(0);
  }, 10 * 60 * 1000);
}

// This function will receive all incoming messages from MQTT
async function handleIncomingMessage (topic, payload) {
  payload = payload.toString()
  log.debug('Incoming message to %s %j', topic, payload)

  const parts = topic.toLowerCase().split('/')
/*
  // Commands for devices
  if (parts[1] === 'set' && parts.length === 4) {
    let device = devices.find((device) => { return device.name.toLowerCase() === parts[2] })
    if (device) {
      return handleDeviceCommand(device, parts[3], payload)
        .then(result => {
          log.debug('Executed %s for %s result: %j', parts[3], device.name, result)
        })
        .catch(err => {
          log.error('Error executing %s for %s %j', parts[3], device.name, err)
        })
    } else {
      log.error('Device with name %s not found', parts[2])
    }
  } else if (parts[1] === 'cmd' && parts.length === 3) {
    return handleGenericCommand(parts[2], payload)
      .then(result => {
        log.debug('Executed %s result: %j', parts[2], result)
      })
      .catch(err => {
        log.error('Error executing %s %j', parts[2], err)
      })
  }
*/
}

// This function is called when a device command is recognized by 'handleIncomingMessage'
async function handleDeviceCommand (device, command, payload) {
  log.debug('Incoming device command %s for %s payload %s', command, device.name, payload)
  switch (command) {
/*
    case 'play':
      return device.play()
    case 'volume':
      if (IsNumeric(payload)) {
        var vol = parseInt(payload)
        if (vol >= 0 && vol <= 100) {
          return device.setVolume(vol)
        }
      } else {
        log.error('Payload for setting volume is not numeric')
      }
      break
*/
    default:
      log.debug('Command %s not yet supported', command)
      break
  }
}

function publishConnectionStatus () {
  let status = '1'
  if (judoconnected) { status = '2' }
  mqttClient.publish(config.name + '/connected', status, {
    qos: 0,
    retain: true
  })
}

const judoPort = 8124;
var judoDevices = null;
var judoToken = null;
var judoConnected = null;
var judoEventsInterval;
const judoStateDrops = 6;
var judoLastState = 0;

function judoRequest(group, command, msgnumber = 1, params = {}) {
  log.debug('judo request: ', group, command, msgnumber);
  var options = {
    method: 'GET',
    url: 'https://' + config.address + ':' + judoPort,
    qs: params,
    headers: { 'Cache-Control': 'no-cache' },
    json: true,
    insecure: true,
    rejectUnauthorized: false
  };
  options.qs.group = group;
  options.qs.command = command;
  options.qs.msgnumber = msgnumber;
  if (judoToken) {
    options.qs.token = judoToken;
  }
  return new Promise((resolve, reject) => {
    log.debug('judo request options: ' + JSON.stringify(options));
    request(options)
    .then((json) => {
      log.debug('judo response', json);
      if (json.status === 'error') {
        if (json.data === 'not logged in') {
          judoLogin()
          .then(() => {
            return judoRequest(group, command, params);
          })
          .catch((err) => {
            reject(err);
          });
        } else if (json.data === 'not connected') {
          log.error('judo not connected');
//          judoConnect()
//          .then(() => {
//            return judoRequest(group, command, params);
//          })
//          .catch((err) => {
//            reject(err);
//          });
        }
      } else {
        if (json.hasOwnProperty('token'))
          judoToken = json.token;
        if (json.hasOwnProperty('serial number'))
          judoConnected = json['serial number'];
        log.debug('response: ' + JSON.stringify(json));
        resolve(json);
      }
    })
    .catch ((err) => {
      log.debug('judo request error', err);
      reject(err);
    });
  });
}

function judoLogin() {
  log.debug('judo login');
  return new Promise((resolve, reject) => {
    judoRequest('register', 'login', 2, {
      name: 'login',
      user: config.username,
      password: config.password,
      role: 'customer'
    })
    .then((json) => {
      if (json.status === 'ok') {
        if (!judoDevices) {
          judoRequest('register', 'show', 1)
          .then((json) => {
            if (json.status === 'ok') {
              judoDevices = json.data;
              resolve(json);
            } else
              reject(json.data);
          })
          .catch((err) => {
            reject(err);
          });
        } else
          resolve(json);
      } else
        reject(json.data);
    })
    .catch((err) => {
      reject(err);
    });
  });
}

function judoConnect(device) {
  log.debug('judo connect: ', device);
  return judoRequest('register', 'connect', 5, {
    parameter: device.wtuType,
    'serial number': device['serial number']
  });
}

function judoCheckEvents(deviceid, line = 0) {
  var device = judoDevices[deviceid];
  if (!device.events)
    device.events = [];
  if (judoConnected != device['serial number'])
    judoConnect(device)
    .then((json) => {
      if (json.status === 'ok')
        judoCheckEvents(deviceid, line);
      else
        log.error('error fetching events: ' + json.data);
    })
    .catch((err) => {
      log.error('error fetching events: ' + err);
    });
  else {
    judoRequest('state', 'event list', 1, {
      line: line,
      offset: 0
    })
    .then((json) => {
      if (json.status === 'ok') {
        if (device.events.indexOf(json.data) == -1) {
          device.events.push(json.data);
          publishEvent(device, json.data);
          if (json.line > 1)
            judoCheckEvents(deviceid, json.line - 1);
          else if (deviceid + 1 < judoDevices.length)
            judoCheckEvents(deviceid + 1);
          else if (++judoLastState >= judoStateDrops) {
            judoFetchStatus(0);
            judoLastState = 0;
          }
        }
      } else
        log.error('error fetching events: ' + json.data);
    })
    .catch((err) => {
      log.error('error fetching events: ' + err);
    });
  }
}

const judoStatusRequests = {
  'i-soft plus': [
    { group: 'version', command: 'devcomm version', msgnumber: 1 },
    { group: 'version', command: 'electrical control name', msgnumber: 1 },
    { group: 'version', command: 'software version', msgnumber: 1 },
    { group: 'version', command: 'hardware version', msgnumber: 1 },
    { group: 'contract', command: 'init date', msgnumber: 1 },
    { group: 'contract', command: 'service date', msgnumber: 1 },
    { group: 'consumption', command: 'water current', msgnumber: 1 },
    { group: 'consumption', command: 'water daily', msgnumber: 1 },
    { group: 'consumption', command: 'water monthly', msgnumber: 1 },
    { group: 'consumption', command: 'water yearly', msgnumber: 1 },
    { group: 'consumption', command: 'water total', msgnumber: 1 },
    { group: 'consumption', command: 'water average', msgnumber: 1 },
    { group: 'consumption', command: 'actual abstraction time', msgnumber: 1 },
    { group: 'consumption', command: 'salt quantity', msgnumber: 1 },
    { group: 'consumption', command: 'salt range', msgnumber: 1 },
    { group: 'settings', command: 'residual hardness', msgnumber: 1 },
    { group: 'settings', command: 'natural hardness', msgnumber: 1 },
    { group: 'waterstop', command: 'standby', msgnumber: 1 },
    { group: 'waterstop', command: 'valve', msgnumber: 1 },
    { group: 'waterstop', command: 'abstraction time', msgnumber: 1 },
    { group: 'waterstop', command: 'flow rate', msgnumber: 1 },
    { group: 'waterstop', command: 'quantity', msgnumber: 1 },
    { group: 'waterstop', command: 'vacation', msgnumber: 1 }
  ],
  "i-dos": [
  ]
};

function judoFetchStatus(deviceid, cmdid = 0) {
  var device = judoDevices[deviceid];
  var cmds = judoStatusRequests[device.wtuType];
  var cmd = cmds[cmdid];
  judoRequest(cmd.group, cmd.command, cmd.msgnumber)
  .then((json) => {
    if (json.status == 'ok')
      publishStatus(device, cmd.command, json.data);
    else
      log.error('error fetching status: ' + json.data);
  })
  .catch((err) => {
    log.error('error fetching events: ' + err);
  });
  if (cmdid + 1 < cmds.length)
    judoFetchStatus(deviceid, cmdid + 1);
  else if (deviceid + 1 < judoDevices.length)
    judoFetchStatus(deviceid + 1);
}

function publishStatus(device, cmd, data) {
  mqttClient.publish(config.name + '/status/' + device.wtuType + '/' + cmd, JSON.stringify({
    ts: new Date().getTime(),
    val: data
  }), true);
}

function publishEvent(device, event) {
  var ed = event.split(',');
  mqttClient.publish(config.name + '/event/' + device.wtuType + '/' + ed[1].trim(), JSON.stringify({
    ts: parseInt(ed[0].trim()),
    val: getEvent(ed)
  }), true);
}

function getEvent(device, values) {
  var data = parseInt(values[1].trim());
  var output = "";
  var identifier;
  var value;
//  Unit tempUnit;
  if (device.wtuType === "i-dos") {
    if (data == 1)
      output = "Störung! Der Pumpenantrieb ist defekt.";
    if (data == 2)
      output = "Störung! Die Minerallösungserkennung ist defekt.";
    if (data == 3)
      return "Der Minerallösungsbehälter ist leer!";
    if (data == 15)
      return "Der Minerallösungsvorrat ist gering.";
    if (data == 16)
      return "Die registrierte Reichweite des Minerallösungsbehälters ist überschritten";
    if (data == 17)
      return "Das Mindesthaltbarkeitsdatum der Minerallösung ist überschritten.";
    if (data == 18) {
      return "Minerallösungsbehälter gewechselt. Minerallösung Typ: " + values[values.length - 2].toUpperCase() + " Gebindegröße: " + (parseDouble(values[values.length - 1]) / 1000.0) + "l";
    } else if (data == 30) {
      return "Die RFID Daten des Minerallösungsbehälters sind nicht lesbar";
    } else {
      if (data == 60)
        return "In 6 Wochen Wartung fällig. ";
      if (data == 61)
        return "Wartung ist fällig";
      if (data == 62)
        return "Wartungsvorwarnung quittiert.";
      if (data == 63)
        return "Wartungsauforderung quittiert.";
      if (data == 80)
        return "Softwareaktualisierung durchgeführt. Version " + values[values.length - 1] + " installiert.";
      if (data == 81)
        return "Online-Softwareaktualisierung durchgeführt. Version " + values[values.length - 1] + "installiert.";
      if (data == 90)
        return "Störung! Verbindung zur el. Steuerung fehlerhaft.";
      if (data == 100)
        return "Wartung durchgeführt Wartungsvertragsnummer" + values[values.length - 3];
      return output;
    }
  } else if (data == 1) {
     return "Störung! Regenerationsantrieb defekt.";
  } else {
    if (data == 2)
      return "Störung! Solestand im Salzbehälter zu hoch.";
    if (data == 3)
      return "Störung! Fehlfunktion Füllventil.";
    if (data == 4)
      return "Störung! Wasserstoppantrieb defekt.";
    if (data == 16)
      return "Resthärte korrigiert";
    if (data == 17)
      return "Na Grenzwert überschritten.";
    if (data == 40)
      return "Wasserstopp geschlossen, maximal zulässige Entnahmezeit " + values[values.length - 1] + " Minuten wurde überschritten.";
    if (data == 41)
        return "Wasserstopp geschlossen, maximal zulässiger Durchfluss " + values[values.length - 1] + "l/h wurde überschritten.";
    else if (data == 42)
        return "Wasserstopp geschlossen, maximal zulässige Wassermenge " + values[values.length - 1] + "l wurde überschritten.";
    else if (data == 43)
      return "Wasserstopp im Urlaubsmodus";
    else {
      if (data == 44)
        return "Wasserstopp geschlossen, Leckagesensor meldet Leckage.";
      if (data == 45)
        return "Wasserstopp manuell geschlossen";
      if (data == 50)
        return "Wasserstopp im Sleepmodus";
      if (data == 51)
        return "Start Aktivierung";
      if (data == 60)
        return "In sechs Wochen Wartung fällig";
      if (data == 61)
        return "Wartung ist fällig";
      if (data == 70)
        return "Reichweite der Salzmenge ist gering";
      if (data == 71)
        return "Achtung Salzmangel!";
      if (data == 80)
        return "Software Update installiert";
      if (data == 81)
        return "Online-Softwareaktualisierung durchgeführt. Version " + values[values.length - 1] + " installiert.";
      if (data == 90)
        return "Störung! Verbindung zur El. Steuerung fehlerhaft.";
      return data;
    }
  }
}

start()
