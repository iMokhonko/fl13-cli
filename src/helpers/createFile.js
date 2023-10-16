const fs = require('fs').promises;

module.exports = async (path, content) => {
  try {
    return await fs.writeFile(path, content);
  } catch (error) {
    console.error(`An error occurred when saving file ${path}:`, error);
  }
};