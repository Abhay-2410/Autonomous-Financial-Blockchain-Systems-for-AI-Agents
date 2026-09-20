const fs = require("node:fs");
const path = require("node:path");

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

const root = path.join(__dirname, "..", "src", "policy");
const out = path.join(__dirname, "..", "dist", "policy");

const files = [
  "schema.cedarschema.json",
  "policies/shopping-bot.cedar",
  "policies/vendor-agent.cedar",
];

for (const f of files) {
  copyFile(path.join(root, f), path.join(out, f));
}

console.log(`Copied ${files.length} policy assets to dist/policy`);
