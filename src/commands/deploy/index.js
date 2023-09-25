const fs = require('fs').promises;

const getEnvServices = require('../aws/getServices');

const spawnCommand = require('../../helpers/spawnCommand');
const readJsonFile = require("../../helpers/readJsonFile");
const replaceTfVars = require("../../helpers/replaceTfVars");
const replaceTfVarsInString = require('../../helpers/replaceTfVarsInString');
const generateTfArgsArrayOfVariables = require('../../helpers/generateTfArgsArrayOfVariables');

const runCommands = async (commands = []) => {
	const localCommands = [...commands];

	while(localCommands.length) {
		const { cmd, args, cwd, shell } = localCommands.shift();

		await spawnCommand({ cmd, args, cwd, shell });
	}
};

const handler = async ({ env = 'dev', feature = 'master' } = {}) => {  
  const {
    terraformResources = [],
    deployChain = []
  } = readJsonFile(`./terraform/${env}/service.json`) ?? {};

  // object for storing outputs from terraform
  const tfOutputs = {};

  while(terraformResources.length) {
    const {
      folderName, // tf directory path
      outputName,
      variables = {},
      global
    } = terraformResources.shift();

    // terraform resources directory
    const cwd = `./terraform/${env}/${folderName}`

    const allVariables = { 
      ...variables, 
      env,
      ...(!global && { feature }), 
    };

    const replacedVars = replaceTfVars(allVariables, tfOutputs);
    const spawnCommandString = generateTfArgsArrayOfVariables(replacedVars);

    const tfWorkspaceName = feature === 'master' || global ? 'default' : feature;

    await runCommands([
      { 
        cmd: 'terraform',
         args: ['init', '-reconfigure'], 
         cwd
      },
      { 
        cmd: 'terraform', 
        args: ['workspace', 'select', '-or-create', tfWorkspaceName], 
        cwd 
      },
      {
        cmd: 'terraform',
        args: [
          'apply', 
          ...spawnCommandString,
          '--auto-approve'
        ],
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

  const services = await getEnvServices(env, feature);
  await fs.writeFile('env.json', JSON.stringify(services, null, 2));

  const deployCommands = deployChain.reduce((commands, command) => {
    const [cmd, ...args] = command.split(' ');

    return [
      ...commands,
      {
        cmd,
        args: args.map(arg => replaceTfVarsInString(arg, tfOutputs)),
        shell: true
      }
    ];
  }, []);

  await runCommands(deployCommands);
};

module.exports = {
  command: 'deploy',
  description: 'Deploy project',
  args: {
    env: {
      description: 'The environment to deploy to',
      alias: 'e',
      type: 'string',
      default: 'dev'
    },
    feature: {
      description: 'The feature to deploy',
      alias: 'f',
      type: 'string',
      default: 'master'
    }
  },
  handler
}