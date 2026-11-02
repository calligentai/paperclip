import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(packageRoot, "src", "server", "mcp-stdio-bridge.mjs");
const destination = path.join(packageRoot, "dist", "server", "mcp-stdio-bridge.mjs");

await mkdir(path.dirname(destination), { recursive: true });
await copyFile(source, destination);
