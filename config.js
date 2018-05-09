var pkg = require('./package.json')
var config = require('yargs')
  .env('JUDO2MQTT')
  .usage(pkg.name + ' ' + pkg.version + '\n' + pkg.description + '\n\nUsage: $0 [options]')
  .describe('v', 'Verbosity level')
  .describe('n', 'instance name. used as mqtt client id and as prefix for connected topic')
  .describe('m', 'mqtt broker url. See https://github.com/mqttjs/MQTT.js#connect-using-a-url')
  .describe('a', 'device IP address')
  .describe('u', 'username')
  .describe('p', 'password')
  .describe('h', 'show help')
  .alias({
    'h': 'help',
    'n': 'name',
    'm': 'mqtt-url',
    'a': 'address',
    'u': 'username',
    'p': 'password',
    'v': 'verbosity',
  })
  .default({
    'm': 'mqtt://127.0.0.1',
    'n': 'judo',
    'v': 'info',
    'd': '/dev/ttyACM0'
  })
  .choices('v', ['error', 'warn', 'info', 'debug'])
  .wrap(80)
  // .config('config')
  .version()
  .help('help')
  .argv

module.exports = config
