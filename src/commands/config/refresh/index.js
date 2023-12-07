const fs = require('fs').promises;

const getEnvServices = require('../../../aws/getServices');
const getTfOutputs = require('../../../terraform/getTfOutputs');

const handler = async ({ env = 'dev', feature = 'master', tfOutputs = null } = {}) => {
  const services = await getEnvServices(env);

  let infrastructure = {};

  const {
    terraformResources = [],
    config = [],
  } = require(`${process.cwd()}/terraform/index.js`);

  // check if tfOutputs provided
  if(tfOutputs) {
    infrastructure = tfOutputs;
  } else {
    infrastructure = await getTfOutputs(terraformResources, { env, feature })
  }

  await Promise.all([
    fs.writeFile('env.cligenerated.json', JSON.stringify(services, null, 2)),
    infrastructure && fs.writeFile('infrastructure.cligenerated.json', JSON.stringify({
      __meta: {
        config: {
          ...config,
          feature,
          env
        }
      },
      ...infrastructure
    }, null, 2)),
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