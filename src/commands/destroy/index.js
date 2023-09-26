const getTfOutputs = require('../../terraform/getTfOutputs');
const runCommands = require('../../helpers/runCommands');
const readJsonFile = require("../../helpers/readJsonFile");
const replaceTfVars = require("../../helpers/replaceTfVars");
const generateTfArgsArrayOfVariables = require('../../helpers/generateTfArgsArrayOfVariables');

const handler = async ({ env = 'dev', feature = 'master' } = {}) => {  
  const {
    terraformResources = []
  } = readJsonFile(`./terraform/${env}/service.json`) ?? {};

  const resourcesTodestroy = feature === 'master'
  ? terraformResources.reverse()
  : terraformResources.filter(({ global = false }) => !global).reverse();

  const tfOutputs = await getTfOutputs(terraformResources, { env, feature });

  while(resourcesTodestroy.length) {
    const {
      folderName, // tf directory path
      variables = {},
    } = resourcesTodestroy.shift();

    const cwd = `./terraform/${env}/${folderName}`

    const allVariables = {
      ...variables,
      ...(!global && { feature }),
      env
    }

    const replacedVars = replaceTfVars(allVariables, tfOutputs);
    const spawnCommandString = generateTfArgsArrayOfVariables(replacedVars);

    await runCommands([
      { 
        cmd: 'terraform',
         args: ['init', '-reconfigure'], 
         cwd
      },
      { 
        cmd: 'terraform', 
        args: ['workspace', 'select', '-or-create', feature === 'master' ? 'default' : feature], 
        cwd 
      },
      {
        cmd: 'terraform',
        args: [
          'destroy', 
          ...spawnCommandString,
          '--auto-approve'
        ],
        cwd
      },
      { 
        cmd: 'terraform', 
        args: ['workspace', 'select', '-or-create', 'default'], 
        cwd 
      },
    ]);

    if(feature !== 'master') {
      await runCommands([
        { 
          cmd: 'terraform', 
          args: ['workspace', 'delete', feature], 
          cwd 
        }
      ])
    }
  }
};

module.exports = {
  command: 'destroy',
  description: 'Destroy feature project',
  args: {
    env: {
      description: 'The environment to destroy in',
      alias: 'e',
      type: 'string',
      default: 'dev'
    },
    feature: {
      description: 'The feature to destroy',
      alias: 'f',
      type: 'string',
      default: 'master'
    }
  },
  handler
}