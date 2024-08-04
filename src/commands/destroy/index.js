const fs = require('fs').promises;

const runCommands = require('../../helpers/runCommands');
const createFile = require('../../helpers/createFile');
const readJsonFile = require("../../helpers/readJsonFile");
const { handler: refreshConfig } = require('../config/refresh');

const isFolderExist = async (path) => {
  try {
    await fs.access(path)

    return true;
  } catch(e) {
    return false;
  }
}

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

const normalizeTfOutputs = (tfOutputs) => {
  return Object.entries(tfOutputs).reduce((memo, [outputName, { value }]) => ({
    ...memo,
    [outputName]: value
  }), {})
};

const handler = async ({ env = 'dev', feature = 'master' } = {}) => {  
  const {
    serviceName = '',
    config = {},
    awsConfiguration = {},
    terraformBackendConfiguration = {},
  } = require(`${process.cwd()}/deploy/index.js`);

  const [
    isGlobalResourcesFolderExist,
    isFeatureResourcesFolderExist,
  ] = await Promise.all([
    isFolderExist(`${process.cwd()}/deploy/terraform/global-resources`),
    isFolderExist(`${process.cwd()}/deploy/terraform/feature-resources`)
  ]);

  await refreshConfig({ 
    env, 
    feature
  });

  if(isFeatureResourcesFolderExist) {
    const featureResourcesCwd = `${process.cwd()}/deploy/terraform/feature-resources`;

    createBackendFile({
      awsConfiguration,
      terraformBackendConfiguration,
      folderName: 'feature-resources',
      cwd: featureResourcesCwd,
      env
    });

    const globalResourcesOutputsRawJson = readJsonFile(`${process.cwd()}/infrastructure.cligenerated.json`) ?? {};
    const { globalResources: globalResourcesOutputs } = globalResourcesOutputsRawJson;

    console.log('globalResourcesOutputs', globalResourcesOutputs);

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
          'destroy', 
          '--var', `env=${env}`,
          '--var', `feature=${feature}`,
          '--var', `global_resources=${JSON.stringify(globalResourcesOutputs)}`,
          '--var', `config=${JSON.stringify(config)}`,
          '--var', `tags={ "service": "${serviceName}", "env": "${env}", "feature": "${feature}", "createdBy": "terraform" }`,
          '--auto-approve'
        ],
        cwd: featureResourcesCwd
      }
    ]);
  }

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
          'destroy', 
          '--var', `env=${env}`, // pass env variable
          '--var', `config=${JSON.stringify(config)}`, // pass config as variable
          '--var', `tags={ "service": "${serviceName}", "env": "${env}", "isGlobalResource": true, "createdBy": "terraform" }`, // pass tags for this service
          '--auto-approve'
        ],
        cwd: globalResourcesCwd
      }
    ]);
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