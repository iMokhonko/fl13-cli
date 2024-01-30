const runCommands = require('../helpers/runCommands');
const readJsonFile = require("../helpers/readJsonFile");
const createFile = require('../helpers/createFile');

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

module.exports = async ({ env = 'dev', feature = 'master' } = {}) => {
  const {
    awsConfiguration = {},
    terraformBackendConfiguration = {},
  } = require(`${process.cwd()}/deploy/index.js`);

  // Create terraform backend files for configurations
  await Promise.all([
    // create backend file for global resources
    createBackendFile({
      awsConfiguration,
      terraformBackendConfiguration,
      folderName: 'global-resources',
      cwd: `${process.cwd()}/deploy/terraform/global-resources`,
      env
    }),

    // create backend file for feature resources
    createBackendFile({
      awsConfiguration,
      terraformBackendConfiguration,
      folderName: 'feature-resources',
      cwd: `${process.cwd()}/deploy/terraform/feature-resources`,
      env
    })
  ]);

  const globalResourcesCwd = `./deploy/terraform/global-resources`;
  const featureResourcesCwd = `./deploy/terraform/feature-resources`;

  await Promise.all([
    runCommands([
      { 
        cmd: 'terraform',
          args: ['init', '-reconfigure'], 
          cwd: globalResourcesCwd
      },
      { 
        cmd: 'terraform', 
        args: ['workspace', 'select', 'default'], 
        cwd: globalResourcesCwd
      },
      { 
        cmd: 'terraform', 
        args: ['output', '-json', '>', 'output.cligenerated.json'], 
        cwd: globalResourcesCwd, 
        shell: true 
      }
    ]),

    runCommands([
      { 
        cmd: 'terraform',
          args: ['init', '-reconfigure'], 
          cwd: featureResourcesCwd
      },
      { 
        cmd: 'terraform', 
        args: ['workspace', 'select', feature], 
        cwd: featureResourcesCwd
      },
      { 
        cmd: 'terraform', 
        args: ['output', '-json', '>', 'output.cligenerated.json'], 
        cwd: featureResourcesCwd, 
        shell: true 
      }
    ])
  ]);

  const globalResourcesOutputsRawJson = readJsonFile(`${globalResourcesCwd}/output.cligenerated.json`) ?? {};
  const featureResourcesOutputsRawJson = readJsonFile(`${featureResourcesCwd}/output.cligenerated.json`) ?? {};

  const globalResourcesOutputs = normalizeTfOutputs(globalResourcesOutputsRawJson);
  const featureResourcesOutputs = normalizeTfOutputs(featureResourcesOutputsRawJson);

  await Promise.all([
    runCommands([
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
    ]),

    runCommands([
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
    ]),
  ]);

  const tfOutputs = {
    globalResources: globalResourcesOutputs,
    featureResources: featureResourcesOutputs,
  }

  console.log('tfOutputs', tfOutputs);

  return tfOutputs;
}