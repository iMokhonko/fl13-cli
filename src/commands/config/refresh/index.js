const fs = require('fs').promises;

const getEnvServices = require('../../../aws/getServices');
const getTfOutputs = require('../../../terraform/getTfOutputs');

const handler = async ({ env = 'dev', feature = 'master', tfOutputs = null } = {}) => {
  const services = await getEnvServices(env);

  let infrastructure = {};

  // check if tfOutputs provided
  if(tfOutputs) {
    infrastructure = tfOutputs;
  } else {
    const {
      terraformResources = []
    } = require(`${process.cwd()}/terraform/index.js`);

    infrastructure = await getTfOutputs(terraformResources, { env, feature })
  }

  await Promise.all([
    fs.writeFile('env.json', JSON.stringify(services, null, 2)),
    infrastructure && fs.writeFile('infrastructure.json', JSON.stringify(infrastructure, null, 2)),
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