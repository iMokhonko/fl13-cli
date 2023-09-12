const replaceTfVarsInString = require('./replaceTfVarsInString');

module.exports = (variables = {}, replacements = {}) => {
  const varsArray = Object.entries(variables);

  return varsArray.reduce((replacedVars, [varName, varValue]) => {
    return {
      ...replacedVars,
      [varName]: replaceTfVarsInString(varValue, replacements)
    }
  }, {});
}