
const { spawn } = require('child_process');
const fs = require('fs');

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

const handler = async (argv) => {  
  const { 
    serviceName, 
    domainName 
  } = readJsonFile('./terraform/project.json') ?? {};

  const commands = [
    { cmd: 'terraform', args: ['init', '-reconfigure'], cwd: `./terraform/init` }, // init terraform
    { cmd: 'terraform', args: ['workspace', 'select', '-or-create', `${argv.env}.${serviceName}`], cwd: `./terraform/init` }, // select/create workspace
    { cmd: 'terraform', args: ['apply', `--var`, `domain_name=${domainName}`, `--var`, `service_name=${serviceName}`, `--var`, `env=${argv.env}`, '--auto-approve'], cwd: `./terraform/init` },

    { cmd: 'terraform', args: ['init', '-reconfigure'], cwd: `./terraform/deploy` }, // init terraform
    { cmd: 'terraform', args: ['workspace', 'select', '-or-create', `${argv.feature}.${argv.env}.${serviceName}`], cwd: `./terraform/deploy` }, // select/create workspace
    { cmd: 'terraform', args: ['apply', `--var`, `domain_name=${domainName}`, `--var`, `service_name=${serviceName}`, `--var`, `env=${argv.env}`, `--var`, `feature=${argv.feature}`, '--auto-approve'], cwd: `./terraform/deploy` },
    { cmd: 'terraform', args: ['output', '-json', '>', 'output.json'], cwd: `./terraform/deploy`, shell: true },
  ];

  await runCommands(commands);

  const {
    s3_bucket_name,
    cloudfront_distribtuion_id
  } = readJsonFile('./terraform/deploy/output.json') ?? {};

  await runCommands([
    { cmd: 'npm', args: ['run', 'build'] },
    { cmd: 'aws', args: ['s3', 'sync', './dist', `s3://${s3_bucket_name.value}`, '--profile', 'default'] },
    { cmd: 'aws', args: ['cloudfront', 'create-invalidation', '--distribution-id', cloudfront_distribtuion_id.value, '--paths', '/*', '--profile', 'default'] }
  ]);

  await runCommands([
    { cmd: 'rm', args: ['output.json'], cwd: `./terraform/deploy`, shell: true },
  ]);
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