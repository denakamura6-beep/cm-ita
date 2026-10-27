// Usage:  npm run hash -- "my password"
const bcrypt = require("bcryptjs");
const pw = process.argv[2];
if (!pw) { console.log('Usage: npm run hash -- "your password"'); process.exit(1); }
console.log("\nPut this line in your .env file:\n");
console.log(`ADMIN_PASSWORD_HASH='${bcrypt.hashSync(pw, 12)}'\n`);
