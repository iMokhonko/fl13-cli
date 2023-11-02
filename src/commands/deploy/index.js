const AWS = require('aws-sdk');
const fs = require('fs').promises;

const spawnCommand = require('../../helpers/spawnCommand');
const readJsonFile = require("../../helpers/readJsonFile");
const getTfOutputs = require('../../terraform/getTfOutputs');
const createFile = require('../../helpers/createFile');

const { handler: refreshConfig } = require('../config/refresh');

const runCommands = async (commands = []) => {
	const localCommands = [...commands];

	while(localCommands.length) {
		const { cmd, args, cwd, shell } = localCommands.shift();

		await spawnCommand({ cmd, args, cwd, shell });
	}
};

// create backend file based on configuration
const createBackendFile = async ({ aws, terraformBackend, cwd, folderName, env }) => {
  return createFile(`${cwd}/backend.cligenerated.tf`, `terraform {
    required_providers {
      aws = {
        source  = "hashicorp/aws"
        version = "~> 5.0"
      }
    }
    
    backend "s3" {
      bucket = "${terraformBackend.bucket}"
      key    = "${terraformBackend.serviceName}/${env}/${folderName}.tfstate"
      region = "${terraformBackend.region}"
    }
  }
  
  provider "aws" {
    region = "${aws.region}"
    profile = "${aws.profile}"
  }
        `);
};

const deleteFile = async (path) => {
  try {
      return fs.unlink(path);
  } catch (err) {
      console.error(err);
  }
}

const handler = async ({ env = 'dev', feature = 'master', only = '' } = {}) => { 
  const {
    serviceName = '',
    config = {},
    aws = {},
    terraformBackend = {},
    terraformResources = [],
    deploy = () => {}
  } = require(`${process.cwd()}/terraform/index.js`);

  if(only !== '' && !['infrastructure', 'deploy'].includes(only)) {
    console.error('Allowed values for --only are', ['infrastructure', 'deploy']);
    return;
  }

  if(only !== '') {
    console.log(`Running only ${only}`)
  }
  
  // create backend files for each tf folder
  await Promise.all(
    terraformResources.map(({ folderName }) => createBackendFile({
      aws,
      terraformBackend,
      folderName,
      cwd: `./terraform/${folderName}`,
      env
    }))
  );

  const tfOutputs = only === 'deploy' ? await getTfOutputs(terraformResources, { env, feature }) : {};

  if(only === '' || only === 'infrastructure') {
    while(terraformResources.length) {
      const {
        folderName, // tf directory path
        outputName,
        global
      } = terraformResources.shift();
  
      // terraform resources directory
      const cwd = `./terraform/${folderName}`

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

            '--var', `env=${env}`, // pass env variable

            '--var', `feature=${feature}`, // pass feature variable (for global resources always will be master)

            '--var', `context=${JSON.stringify(tfOutputs)}`, // pass context (context is outputs object from previous steps)

            '--var', `config=${JSON.stringify(config)}`, // pass config as variable

            '--var', `tags={ "service": "${serviceName}", "env": "${env}", "feature": "${feature}", "createdBy": "terraform" }`, // pass tags for this service

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
  }

  await refreshConfig({ env, feature, tfOutputs });

  // delete backend files
  // await Promise.all(terraformResources.map(({ folderName }) => deleteFile(`./terraform/${folderName}/backend.tf`)));

  if(only === '' || only === 'deploy') {
    await deploy({
      env,
      feature,
      config,
      AWS,
      infrastructure: tfOutputs
    });
  }
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
    },
    only: {
      description: 'Run only infrastructure setup or deploy chain scripts',
      alias: 'o',
      type: 'string',
      default: ''
    }
  },
  handler
}