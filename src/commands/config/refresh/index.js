const fs = require('fs').promises;

const getEnvServices = require('../../../aws/getServices');
const getTfOutputs = require('../../../terraform/getTfOutputs');
const readJsonFile = require("../../../helpers/readJsonFile");

const handler = async ({ env = 'dev', feature = 'master', tfOutputs = null } = {}) => {
  const {
    terraformResources = [],
  } = readJsonFile(`./terraform/${env}/service.json`) ?? {};


  const services = await getEnvServices(env);
  const infrastructure = tfOutputs ?? await getTfOutputs(terraformResources, { env, feature })

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