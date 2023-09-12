const spawnCommand = require('../../helpers/spawnCommand');
const readJsonFile = require("../../helpers/readJsonFile");
const replaceTfVars = require("../../helpers/replaceTfVars");
const generateTfArgsArrayOfVariables = require('../../helpers/generateTfArgsArrayOfVariables');

const runCommands = async (commands = []) => {
	const localCommands = [...commands];

	while(localCommands.length) {
		const { cmd, args, cwd, shell } = localCommands.shift();

		await spawnCommand({ cmd, args, cwd, shell });
	}
};

const getTfOutputs = async (resources = [], { env = 'dev', feature = 'master' } = {}) => {
  resources = [...resources];

  const tfOutputs = {};

  while(resources.length) {
    const {
      folderName,
      outputName,
      global
    } = resources.shift();

    const cwd = `./terraform/${env}/${folderName}`;

    await runCommands([
      { 
        cmd: 'terraform',
          args: ['init', '-reconfigure'], 
          cwd
      },
      { 
        cmd: 'terraform', 
        args: ['workspace', 'select', '-or-create', feature === 'master' || global ? 'default' : feature], 
        cwd 
      },
      { 
        cmd: 'terraform', 
        args: ['output', '-json', '>', 'output.json'], 
        cwd, 
        shell: true 
      }
    ]);

    const outputs = readJsonFile(`${cwd}/output.json`) ?? {};

    tfOutputs[outputName] = Object.entries(outputs).reduce((memo, [outputName, { value }]) => ({
      ...memo,
      [outputName]: value
    }), {});

    await runCommands(
      [
        {
          cmd: 'rm',
          args: ['output.json'],
          cwd, 
          shell: true
        },
        { 
          cmd: 'terraform', 
          args: ['workspace', 'select', '-or-create', 'default'], 
          cwd 
        },
      ]
    );
  }

  return tfOutputs;
}

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