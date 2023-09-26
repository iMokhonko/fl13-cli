const fs = require('fs').promises;

const getEnvServices = require('../../../aws/getServices');

const handler = async ({ env = 'dev' } = {}) => {  
  const services = await getEnvServices(env);
  await fs.writeFile('env.json', JSON.stringify(services, null, 2));

  console.log('Config refreshed')
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
  },
  handler
}