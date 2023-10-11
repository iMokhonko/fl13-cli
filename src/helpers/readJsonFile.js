const fs = require('fs');

module.exports = (path) => {
  const jsonString = fs.readFileSync(path, 'utf8');

  return JSON.parse(jsonString);
};
