const { spawn, exec } = require('child_process');

module.exports = (command) => exec(command, (error, stdout, stderr) => {
  if (error) {
      // You can print the error if there is one
      console.error(error);
      return;
   }
   // stdout gives you the output from your command
   console.log(stdout);

   // stderr gives you the error (if any) from your command
   console.log(stderr);
});