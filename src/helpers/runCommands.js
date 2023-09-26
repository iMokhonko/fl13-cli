const spawnCommand = require('./spawnCommand');

module.exports = async (commands = []) => {
	const localCommands = [...commands];

	while(localCommands.length) {
		const { cmd, args, cwd, shell } = localCommands.shift();

		await spawnCommand({ cmd, args, cwd, shell });
	}
};