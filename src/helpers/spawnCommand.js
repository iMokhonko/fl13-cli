const { spawn } = require('child_process');

module.exports = async ({ cmd, args, cwd, shell = false }) => {
	return new Promise(resolve => {
		const process = spawn(cmd, args, { cwd, shell });
    
		process.stdout.on('data', data => console.log(`${data}`));
		process.stderr.on('data', data => console.error(`${data}`));

		process.on('exit', resolve);
	});
}
