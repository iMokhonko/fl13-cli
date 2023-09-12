const _get = require('lodash/get');

module.exports = (str, replacements) => 
  str.replaceAll(
    /\<tf-outputs:(.*?)\>/g, 
    (matchedString, varName) => _get(replacements, varName, matchedString)
  )