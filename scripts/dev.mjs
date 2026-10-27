import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const valueAfter = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const host = valueAfter("--host", valueAfter("--hostname", "0.0.0.0"));
const port = valueAfter("--port", "3000");
const command = args.includes("--strictPort") ? "start" : "dev";
const nextArgs = [require.resolve("next/dist/bin/next"), command];
if (command === "dev") nextArgs.push("--webpack");
nextArgs.push("-H", host, "-p", port);
const child = spawn(process.execPath, nextArgs, { stdio: "inherit" });
child.on("exit", (code, signal) => signal ? process.kill(process.pid, signal) : process.exit(code ?? 0));

