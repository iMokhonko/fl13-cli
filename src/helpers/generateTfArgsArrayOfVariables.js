module.exports = (variables = {}) => Object.entries(variables).reduce(
  (varsArray, [varName, varValue]) => {
    return [
      ...varsArray,
      '--var',
      `${varName}=${varValue}`
    ];
  },
  []
);