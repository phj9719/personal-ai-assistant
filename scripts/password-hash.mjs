import { randomBytes, scryptSync } from "node:crypto";

// Read through a pipe so passwords never appear in command-line arguments.
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const password = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
if (password.length < 8 || password.length > 256) {
  console.error("비밀번호는 8~256자여야 합니다.");
  process.exitCode = 1;
} else {
  const salt = randomBytes(16).toString("hex");
  console.log(`${salt}:${scryptSync(password, salt, 64).toString("hex")}`);
}
