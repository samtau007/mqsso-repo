// Prints fresh secrets for .env (or Vercel environment variables). Run once per environment.
// Usage: node scripts/generate-secrets.mjs
import { generateKeyPairSync, randomBytes } from "node:crypto";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = privateKey.export({ format: "jwk" });
jwk.kid = `mq-${new Date().toISOString().slice(0, 10)}`;
jwk.alg = "RS256";
jwk.use = "sig";

const b64 = (n) => randomBytes(n).toString("base64");

console.log(`MQ_JWKS='${JSON.stringify({ keys: [jwk] })}'`);
console.log(`MQ_COOKIE_KEYS=${randomBytes(32).toString("base64url")}`);
console.log(`MQ_VAULT_KEY=${b64(32)}`);
console.log(`MQ_INDEX_KEY=${b64(32)}`);
console.log(`MQ_SESSION_KEY=${b64(32)}`);
console.log(`MQ_PAIRWISE_SALT=${randomBytes(32).toString("base64url")}`);
console.log(`CRON_SECRET=${randomBytes(24).toString("base64url")}`);
