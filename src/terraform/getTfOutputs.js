const runCommands = require('../helpers/runCommands');
const readJsonFile = require("../helpers/readJsonFile");

module.exports = async (resources = [], { env = 'dev', feature = 'master' } = {}) => {
  // TODO investigate this approach
  // try {
  //   const infrastructureData = readJsonFile(`infrastructure.json`) ?? null;

  //   if(infrastructureData !== null)
  //     return infrastructureData;
  // } catch(e) {}

  resources = [...resources];

  const tfOutputs = {};

  while(resources.length) {
    const {
      folderName,
      outputName,
      global
    } = resources.shift();

    const cwd = `./terraform/${folderName}`;

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