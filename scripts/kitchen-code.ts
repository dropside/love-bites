// Prints the hash for a kitchen code. Run: npm run kitchen-code -- "my code"
import { createHash } from 'node:crypto';

const code = process.argv.slice(2).join(' ');
if (!code.trim()) {
  console.error('Usage: npm run kitchen-code -- "my code"');
  process.exit(1);
}
const hash = createHash('sha256').update(`love-bites-kitchen-v1:${code.trim().toLowerCase()}`).digest('hex');
console.log(hash);
