#!/usr/bin/env node

const deployCommand = require('./commands/deploy');
const destroyCommand = require('./commands/destroy')

const yargv = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

yargv(hideBin(process.argv))
  .command(
    deployCommand.command, 
    deployCommand.description, 
    deployCommand.args,
    deployCommand.handler)
  .help()
  .alias('help', 'h')
  .argv;

  yargv(hideBin(process.argv))
  .command(
    destroyCommand.command, 
    destroyCommand.description, 
    destroyCommand.args,
    destroyCommand.handler)
  .help()
  .alias('help', 'h')
  .argv;