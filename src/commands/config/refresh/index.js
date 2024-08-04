const fs = require('fs').promises;

const getEnvServices = require('../../../aws/getServices');
const getTfOutputs = require('../../../terraform/getTfOutputs');

const handler = async ({ env = 'dev', feature = 'master', tfOutputs = null } = {}) => {
  const {
    serviceName = '',
    config = {},
  } = require(`${process.cwd()}/deploy/index.js`);

  await Promise.all([
    fs.writeFile('env.cligenerated.json', JSON.stringify({ ...config, serviceName, env, feature }, null, 2)),
    fs.writeFile('services.cligenerated.json', JSON.stringify(await getEnvServices(env), null, 2)),
    fs.writeFile('infrastructure.cligenerated.json', JSON.stringify(tfOutputs ?? await getTfOutputs({ feature, env }), null, 2)),
  ]);

  console.log('Config refreshed');
};

module.exports = {
  command: 'config refresh',
  description: 'Config operations',
  args: {
    env: {
      description: 'The environment to get config from',
      alias: 'e',
      type: 'string',
      default: 'dev'
    },
    feature: {
      description: 'The feature to get infrastructure from',
      alias: 'f',
      type: 'string',
      default: 'master'
    },
  },
  handler
}