const fs = require('fs').promises;

const spawnCommand = require('../../helpers/spawnCommand');
const readJsonFile = require("../../helpers/readJsonFile");
const createFile = require('../../helpers/createFile');

const { handler: refreshConfig } = require('../config/refresh');

const isFolderExist = async (path) => {
  try {
    await fs.access(path)

    return true;
  } catch(e) {
    return false;
  }
}

const normalizeTfOutputs = (tfOutputs) => {
  return Object.entries(tfOutputs).reduce((memo, [outputName, { value }]) => ({
    ...memo,
    [outputName]: value
  }), {})
};

const runCommands = async (commands = []) => {
	const localCommands = [...commands];

	while(localCommands.length) {
		const { cmd, args, cwd, shell } = localCommands.shift();

		await spawnCommand({ cmd, args, cwd, shell });
	}
};

// create backend file based on configuration
const createBackendFile = async ({ awsConfiguration, terraformBackendConfiguration, cwd, folderName, env }) => {
  return createFile(`${cwd}/backend.cligenerated.tf`, `terraform {
    required_providers {
      aws = {
        source  = "hashicorp/aws"
        version = "~> 5.0"
      }
    }
    
    backend "s3" {
      bucket = "${terraformBackendConfiguration.bucket}"
      key    = "${terraformBackendConfiguration.serviceName}/${env}/${folderName}.tfstate"
      region = "${terraformBackendConfiguration.region}"
    }
  }
  
  provider "aws" {
    region = "${awsConfiguration.region}"
    profile = "${awsConfiguration.profile}"
  }
        `);
};

const handler = async ({ env = 'dev', feature = 'master' } = {}) => { 
  const {
    serviceName = '',
    config = {},
    awsConfiguration = {},
    terraformBackendConfiguration = {},
    preDeploy = () => {},
    deploy = () => {}
  } = require(`${process.cwd()}/deploy/index.js`);

  await preDeploy();

  const [
    isGlobalResourcesFolderExist,
    isFeatureResourcesFolderExist,
  ] = await Promise.all([
    isFolderExist(`${process.cwd()}/deploy/terraform/global-resources`),
    isFolderExist(`${process.cwd()}/deploy/terraform/feature-resources`)
  ])

  let globalResourcesOutputs = {};
  let featureResourcesOutputs = {};

  if(isGlobalResourcesFolderExist) {
    const globalResourcesCwd = `./deploy/terraform/global-resources`;

    await createBackendFile({
      awsConfiguration,
      terraformBackendConfiguration,
      folderName: 'global-resources',
      cwd: globalResourcesCwd,
      env
    })

    await runCommands([
      { 
        cmd: 'terraform',
          args: ['init', '-reconfigure'], 
          cwd: globalResourcesCwd
      },
      { 
        cmd: 'terraform', 
        args: ['workspace', 'select', '-or-create', 'default'], // for global resources workspace always 'default' 
        cwd: globalResourcesCwd
      },
      {
        cmd: 'terraform',
        args: [
          'apply', 
          '--var', `env=${env}`, // pass env variable
          '--var', `config=${JSON.stringify(config)}`, // pass config as variable
          '--var', `tags={ "service": "${serviceName}", "env": "${env}", "isGlobalResource": true, "createdBy": "terraform" }`, // pass tags for this service
          '--auto-approve'
        ],
        cwd: globalResourcesCwd
      },
      { 
        cmd: 'terraform', 
        args: ['output', '-json', '>', 'output.cligenerated.json'], 
        cwd: globalResourcesCwd, 
        shell: true 
      }
    ]);

    const globalResourcesOutputsRawJson = readJsonFile(`${globalResourcesCwd}/output.cligenerated.json`) ?? {};
    globalResourcesOutputs = normalizeTfOutputs(globalResourcesOutputsRawJson);

    await runCommands(
      [
        { 
          cmd: 'terraform', 
          args: ['workspace', 'select', '-or-create', 'default'], 
          cwd: globalResourcesCwd 
        },
        {
          cmd: 'rm',
          args: ['output.cligenerated.json'],
          cwd: globalResourcesCwd, 
          shell: true
        },
        {
          cmd: 'rm',
          args: ['backend.cligenerated.tf'],
          cwd: globalResourcesCwd, 
          shell: true
        },
      ]
    );
  }

  if(isFeatureResourcesFolderExist) {
    const featureResourcesCwd = `${process.cwd()}/deploy/terraform/feature-resources`;

    createBackendFile({
      awsConfiguration,
      terraformBackendConfiguration,
      folderName: 'feature-resources',
      cwd: featureResourcesCwd,
      env
    })

    await runCommands([
      { 
        cmd: 'terraform',
        args: ['init', '-reconfigure'], 
        cwd: featureResourcesCwd
      },
      { 
        cmd: 'terraform', 
        args: ['workspace', 'select', '-or-create', feature],
        cwd: featureResourcesCwd
      },
      {
        cmd: 'terraform',
        args: [
          'apply', 
          '--var', `env=${env}`,
          '--var', `feature=${feature}`,
          '--var', `global_resources=${JSON.stringify(globalResourcesOutputs)}`,
          '--var', `config=${JSON.stringify(config)}`,
          '--var', `tags={ "service": "${serviceName}", "env": "${env}", "feature": "${feature}", "createdBy": "terraform" }`,
          '--auto-approve'
        ],
        cwd: featureResourcesCwd
      },
      { 
        cmd: 'terraform', 
        args: ['output', '-json', '>', 'output.cligenerated.json'], 
        cwd: featureResourcesCwd, 
        shell: true 
      }
    ]);

    const featureResourcesOutputsRawJson = readJsonFile(`${featureResourcesCwd}/output.cligenerated.json`) ?? {};
    featureResourcesOutputs = normalizeTfOutputs(featureResourcesOutputsRawJson);

    await runCommands(
      [
        { 
          cmd: 'terraform', 
          args: ['workspace', 'select', '-or-create', 'default'], 
          cwd: featureResourcesCwd 
        },
        {
          cmd: 'rm',
          args: ['output.cligenerated.json'],
          cwd: featureResourcesCwd, 
          shell: true
        },
        {
          cmd: 'rm',
          args: ['backend.cligenerated.tf'],
          cwd: featureResourcesCwd, 
          shell: true
        },
      ]
    );
  }

  const tfOutputs = {
    globalResources: globalResourcesOutputs,
    featureResources: featureResourcesOutputs,
  };

  await refreshConfig({ 
    env, 
    feature, 
    tfOutputs
  });

  await deploy({
    env,
    feature,
    config,
    // AWS,
    infrastructure: tfOutputs
  });
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