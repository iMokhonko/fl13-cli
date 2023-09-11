
const { spawn, exec } = require('child_process');
const fs = require('fs');

const _get = require('lodash/get');

const runCommand = async ({ cmd, args, cwd, shell = false }) => {
	return new Promise(resolve => {
		const process = spawn(cmd, args, { cwd, shell });
    
		process.stdout.on('data', data => console.log(`${data}`));
		process.stderr.on('data', data => console.error(`${data}`));

		process.on('exit', resolve);
	});
}

const runCommands = async (commands = []) => {
	const localCommands = [...commands];

	while(localCommands.length) {
		const { cmd, args, cwd, shell } = localCommands.shift();

		await runCommand({ cmd, args, cwd, shell });
	}
};

const readJsonFile = (path) => {
  try {
    const jsonString = fs.readFileSync(path, 'utf8');

    return JSON.parse(jsonString);
  } catch (err) {
      console.log("No configuration file found or file is not in JSON format", err);

      return null;
  }
};

const replaceTfVarsPlaceholderWithValues = 
  (str, replacements) => 
    str.replaceAll(
      /\<tf-outputs:(.*?)\>/g, 
      (matchedString, varName) => _get(replacements, varName, matchedString)
    )

const handler = async (argv) => {  
  const {
    env = 'dev',
    feature = 'master'
  } = argv;

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

    const commands = [
      // init terraform when running this command
      { 
        cmd: 'terraform',
         args: ['init', '-reconfigure'], 
         cwd
      },
    ];

    // if resources are not marked as global create terraform workspace
    if(!global && feature !== 'master') {
      commands.push(
        { 
          cmd: 'terraform', 
          args: ['workspace', 'select', '-or-create', feature], 
          cwd 
        },
      )
    }

    const varsArray = Object.entries(variables);
    const argsWithReplacesVars = varsArray.reduce((replacedVars, [varName, varValue]) => {
      return [
        ...replacedVars,
        [varName, replaceTfVarsPlaceholderWithValues(varValue, tfOutputs)]
      ];
    }, []);

    const argsWithReplacesCmdLineArgs = argsWithReplacesVars.map(([varName, varValue]) => [
      varName,
      argv[varName] ? argv[varName] : varValue
    ]);

    const stringVars = argsWithReplacesCmdLineArgs.reduce(
      (memo, [varName, varValue]) => 
      [...memo, '--var', `${varName}=${varValue}`],
      []
    );

    if(feature && !global) {
      stringVars.push('--var', `feature=${feature}`)
    }

    if(env) {
      stringVars.push('--var', `env=${env}`)
    }

    commands.push(
      {
        cmd: 'terraform',
        args: [
          'apply', 
          ...stringVars,
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
    );

    await runCommands(commands);

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

    console.log(outputName + " ->", tfOutputs);
  }

  const execCommandsString = deployChain.reduce((allCommands, command, index) => {
    if(index === 0) {
      return replaceTfVarsPlaceholderWithValues(command, tfOutputs);
    } else {
      return `${allCommands} && ${replaceTfVarsPlaceholderWithValues(command, tfOutputs)}`
    }
  }, '');

  exec(execCommandsString, (error, stdout, stderr) => {
    if (error) {
        // You can print the error if there is one
        console.error(error);
        return;
     }
     // stdout gives you the output from your command
     console.log(stdout);
     // stderr gives you the error (if any) from your command
     console.log(stderr);
  });
};

const args = {
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
}

module.exports = {
  command: 'deploy',
  description: 'Deploy project',
  args,
  handler
}