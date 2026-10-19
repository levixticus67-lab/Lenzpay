import { randomBytes, scrypt as nodeScrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { stdin, stdout } from 'node:process';

const scrypt = promisify(nodeScrypt);

try {
  if (!stdin.isTTY || !stdin.setRawMode) {
    throw new Error('Run npm run admin:hash in an interactive terminal so the password can be entered without echo.');
  }
  const password = await new Promise((resolve, reject) => {
    let value = '';
    stdout.write('Admin password (hidden): ');
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    const onData = (character) => {
      if (character === '\u0003') {
        cleanup();
        reject(new Error('Cancelled.'));
      } else if (character === '\r' || character === '\n') {
        cleanup();
        stdout.write('\n');
        resolve(value);
      } else if (character === '\u007f' || character === '\b') {
        value = value.slice(0, -1);
      } else {
        value += character;
      }
    };
    function cleanup() {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    }
    stdin.on('data', onData);
  });
  if (password.length < 14) {
    throw new Error('Use an admin password with at least 14 characters.');
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  console.log(`\nADMIN_PASSWORD_HASH=scrypt$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
