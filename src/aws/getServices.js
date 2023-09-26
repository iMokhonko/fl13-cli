const AWS = require('aws-sdk');

module.exports = async (env = 'dev', opts = {}) => {
  const {
    region = 'us-east-1',
    apiVersion = '2014-11-06'
  } = opts ?? {};

  const ssm = new AWS.SSM({ apiVersion, region });

  const params = {   
    Path: `/${env}`,
    WithDecryption: true      
  };
  
  const { Parameters } = await ssm.getParametersByPath(params).promise();
  
  return Parameters.reduce((params, { Name, Value }) => ({
    ...params,
    [Name.split('/').pop()]: Value
  }), {});
};