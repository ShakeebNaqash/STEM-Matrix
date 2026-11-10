import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = path.join(root, "stemmatrix-unix", "backend");
const frontendDir = path.join(root, "frontend");
const demoEnvPath = path.join(root, "scripts", "demo.env");
const DEFAULT_ROUTES = "health,practice,grade";

const colorEnabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const options = {
  setup: false,
  rebuild: false,
  mockUi: false,
  testModel: false,
  withOllama: false,
  open: false,
  help: false,
  backendPort: 8000,
  frontendPort: 3000,
};

const children = [];
let stopping = false;

function paint(code, text) {
  return colorEnabled ? `\u001b[${code}m${text}\u001b[0m` : text;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readPort(value, flag) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail(`${flag} needs a port from 1 to 65535.`);
  }
  return port;
}

function parseArgs(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    const [flag, inline] = arg.split("=", 2);
    const value = inline ?? argv[index + 1];
    switch (flag) {
      case "--setup":
        options.setup = true;
        break;
      case "--rebuild":
        options.rebuild = true;
        break;
      case "--mock-ui":
        options.mockUi = true;
        break;
      case "--test-model":
        options.testModel = true;
        break;
      case "--with-ollama":
        options.withOllama = true;
        break;
      case "--open":
        options.open = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--backend-port":
        options.backendPort = readPort(value, flag);
        if (!inline) index += 1;
        break;
      case "--frontend-port":
        options.frontendPort = readPort(value, flag);
        if (!inline) index += 1;
        break;
      default:
        fail(`Unknown option ${arg}. Run: node scripts/start.mjs --help`);
    }
  }
}

function printHelp() {
  console.log(`StemMatrix demo

Usage
  node scripts/start.mjs [--setup] [--rebuild] [--mock-ui] [--test-model]
                         [--with-ollama] [--open]
                         [--backend-port 8000] [--frontend-port 3000]

  --setup         Create the backend virtualenv, install its requirements,
                  install frontend packages, and build the frontend.
                  This is the only step that uses the network.
  --rebuild       Build the frontend again before starting.
  --mock-ui       Start only the scripted frontend. No backend.
  --test-model    Start the backend with STEMMATRIX_MODEL=mock.
                  The status pill says Test model.
  --with-ollama   Start ollama serve when it is installed and port 11434 is free.
                  The backend does not call Ollama yet.
  --open          Open the app in a browser once it answers.
  --help          Show this message.
`);
}

function nodeMajor() {
  const major = Number(process.versions.node.split(".")[0]);
  return Number.isFinite(major) ? major : 0;
}

function venvPython() {
  return process.platform === "win32"
    ? path.join(backendDir, ".venv", "Scripts", "python.exe")
    : path.join(backendDir, ".venv", "bin", "python");
}

function commandOnPath(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8", stdio: "ignore" });
  return result.status === 0;
}

function pythonLauncher() {
  const candidates = process.platform === "win32" ? [["py", "-3"], ["python"]] : [["python3"], ["python"]];
  for (const candidate of candidates) {
    const command = candidate[0];
    const prefix = candidate.slice(1);
    if (!command) continue;
    const result = spawnSync(command, [...prefix, "-c", "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')"], {
      encoding: "utf8",
    });
    if (result.status !== 0) continue;
    const [majorText, minorText] = (result.stdout ?? "").trim().split(".");
    const major = Number(majorText);
    const minor = Number(minorText);
    if (major > 3 || (major === 3 && minor >= 10)) return { command, prefix };
  }
  return null;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32" && command.endsWith(".cmd"),
  });
  if (result.error) fail(`Could not run ${command}: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function setup() {
  if (!existsSync(venvPython())) {
    const python = pythonLauncher();
    if (!python) {
      fail("Python 3.10 or newer is required to create the backend virtual environment. Install it from https://www.python.org/downloads/ and run this again.");
    }
    console.log("Creating the backend virtual environment.");
    run(python.command, [...python.prefix, "-m", "venv", path.join(backendDir, ".venv")], backendDir);
  }
  console.log("Installing backend requirements.");
  run(venvPython(), ["-m", "pip", "install", "-r", "requirements.txt"], backendDir);
  console.log("Installing frontend packages.");
  run(npmCommand(), ["ci"], frontendDir);
  console.log("Building the frontend.");
  run(npmCommand(), ["run", "build"], frontendDir);
}

function missingPrerequisites() {
  const missing = [];
  if (nodeMajor() < 20) {
    missing.push(`Node.js ${process.versions.node} is installed. StemMatrix needs Node.js 20 or newer: https://nodejs.org`);
  }
  if (!options.mockUi && !existsSync(venvPython())) {
    missing.push("The backend virtual environment is missing. Run: node scripts/start.mjs --setup");
  }
  if (!existsSync(path.join(frontendDir, "node_modules"))) {
    missing.push("frontend/node_modules is missing. Run: node scripts/start.mjs --setup");
  }
  if (!existsSync(path.join(frontendDir, ".next"))) {
    missing.push("The frontend build is missing. Run: node scripts/start.mjs --setup");
  }
  return missing;
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function readRoutes() {
  if (!existsSync(demoEnvPath)) return DEFAULT_ROUTES;
  const lines = readFileSync(demoEnvPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    if (key === "BACKEND_LIVE_ROUTES") return trimmed.slice(separator + 1).trim() || DEFAULT_ROUTES;
  }
  return DEFAULT_ROUTES;
}

function pipe(stream, write) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) write(line);
  });
}

function prefix(name, code) {
  const label = paint(code, `[${name}]`);
  return (line) => {
    console.log(`${label} ${line}`);
  };
}

function track(child, name) {
  children.push(child);
  child.on("exit", (code, signal) => {
    if (stopping) return;
    const detail = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.error(paint("31", `[${name}] exited (${detail}). Stopping the other processes.`));
    void shutdown(code && code !== 0 ? code : 1);
  });
}

function startProcess(name, code, command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (child.stdout) pipe(child.stdout, prefix(name, code));
  if (child.stderr) pipe(child.stderr, prefix(name, code));
  track(child, name);
  return child;
}

async function waitFor(url, label, limitMs) {
  const started = Date.now();
  let lastError = "no response";
  while (Date.now() - started < limitMs) {
    if (stopping) return;
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "connection failed";
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  console.error(`${label} did not answer at ${url} within ${Math.round(limitMs / 1000)}s (${lastError}).`);
  await shutdown(1);
}

function openBrowser(url) {
  if (process.platform === "darwin") {
    spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    return;
  }
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    return;
  }
  spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
}

async function ollamaAlreadyUp() {
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags");
    return response.ok;
  } catch {
    return false;
  }
}

async function maybeStartOllama() {
  if (!options.withOllama) return;
  if (!commandOnPath("ollama")) {
    console.log("ollama is not on PATH, so it was not started.");
    return;
  }
  if (await ollamaAlreadyUp()) {
    console.log("Ollama is already answering on port 11434.");
    return;
  }
  startProcess("ollama", "33", "ollama", ["serve"], root, {});
  // TODO: when the local model adapter exists, set its env var here
  // (for example STEMMATRIX_MODEL=ollama) so the backend uses this server.
}

async function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  process.exit(code);
}

async function main() {
  parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (nodeMajor() < 20 && options.setup) {
    fail(`Node.js ${process.versions.node} is installed. StemMatrix needs Node.js 20 or newer: https://nodejs.org`);
  }
  if (options.setup) setup();
  if (options.rebuild) {
    console.log("Building the frontend.");
    run(npmCommand(), ["run", "build"], frontendDir);
  }

  const missing = missingPrerequisites();
  if (missing.length > 0) {
    for (const line of missing) console.error(line);
    process.exit(1);
  }

  const ports = options.mockUi ? [["frontend", options.frontendPort]] : [["backend", options.backendPort], ["frontend", options.frontendPort]];
  for (const [name, port] of ports) {
    if (!(await portFree(port))) {
      fail(`Port ${port} is already in use (${name}). Stop that process, or pass --${name}-port.`);
    }
  }

  process.on("SIGINT", () => {
    void shutdown(0);
  });
  process.on("SIGTERM", () => {
    void shutdown(0);
  });

  await maybeStartOllama();

  const routes = options.mockUi ? "" : readRoutes();
  const modelMode = options.testModel ? "mock" : "none";
  const appUrl = `http://127.0.0.1:${options.frontendPort}`;

  if (!options.mockUi) {
    startProcess("api", "36", venvPython(), ["-m", "uvicorn", "app.api.main:app", "--host", "127.0.0.1", "--port", String(options.backendPort)], backendDir, {
      STEMMATRIX_MODEL: modelMode,
    });
    await waitFor(`http://127.0.0.1:${options.backendPort}/api/health`, "The backend", 60_000);
  }

  const nextBin = path.join(frontendDir, "node_modules", "next", "dist", "bin", "next");
  startProcess("web", "32", process.execPath, [nextBin, "start", "-p", String(options.frontendPort)], frontendDir, {
    BACKEND_URL: options.mockUi ? "" : `http://127.0.0.1:${options.backendPort}`,
    BACKEND_LIVE_ROUTES: routes,
  });
  await waitFor(appUrl, "The frontend", 60_000);

  const routeLine = options.mockUi ? "none (scripted preview)" : routes;
  const modelLine = options.mockUi ? "preview" : modelMode === "mock" ? "mock (the pill says Test model)" : "none";
  console.log("");
  console.log("StemMatrix is ready");
  console.log(`  URL          ${appUrl}`);
  console.log(`  Live routes  ${routeLine}`);
  console.log(`  Model        ${modelLine}`);
  console.log("");

  if (options.open) openBrowser(appUrl);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "The demo failed to start.";
  fail(message);
});
