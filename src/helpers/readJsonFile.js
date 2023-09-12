const fs = require('fs');

module.exports = (path) => {
  try {
    const jsonString = fs.readFileSync(path, 'utf8');

    return JSON.parse(jsonString);
  } catch (err) {
      console.log("File cannot be read", err);

      return null;
  }
};
