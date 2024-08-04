const { SSM } = require('@aws-sdk/client-ssm');

module.exports = async (env = 'dev', opts = {}) => {
  const {
    region = 'eu-central-1',
    apiVersion = '2014-11-06'
  } = opts ?? {};

  const ssm = new SSM({
    // The key apiVersion is no longer supported in v3, and can be removed.
    // @deprecated The client uses the "latest" apiVersion.
    apiVersion,

    region
  });

  const params = {   
    Path: `/${env}`,
    WithDecryption: true      
  };
  
  const { Parameters } = await ssm.getParametersByPath(params);
  
  return Parameters.reduce((params, { Name, Value }) => ({
    ...params,
    [Name.split('/').pop()]: Value
  }), {});
};