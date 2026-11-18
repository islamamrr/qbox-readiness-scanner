#!/usr/bin/env node
// Qbox Readiness Scanner CLI. Read-only and offline.

import { writeFileSync } from 'node:fs';
import { scan, VERSION } from '../src/scan.js';
import { renderConsole, renderJson } from '../src/report.js';

const HELP = `Qbox Readiness Scanner v${VERSION}
Offline QBCore -> Qbox migration audit and server health check for FiveM.

Usage:
  qrs scan <server-data folder> [options]

Options:
  --resources <dir>   resources folder (default: <folder>/resources)
  --cfg <file>        server.cfg to read (default: <folder>/server.cfg if present)
  --json <file>       also write the results as JSON
  --all               list every resource's verdict, not only the ones that need work
  --no-color          plain output
  -h, --help          show this help
  -v, --version       show the version

Exit code is 1 when any error-level problem is found.`;

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--resources' || a === '--cfg' || a === '--json') {
      if (!argv[i + 1]) throw new Error(`${a} needs a value`);
      opts[a.slice(2)] = argv[++i];
    } else if (a === '--all') opts.all = true;
    else if (a === '--no-color') opts.color = false;
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '-v' || a === '--version') opts.version = true;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else opts._.push(a);
  }
  return opts;
}

function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message + '\n\n' + HELP); return 2; }
  if (opts.version) { console.log(VERSION); return 0; }
  const [cmd, folder] = opts._;
  if (opts.help || !cmd) { console.log(HELP); return opts.help ? 0 : 2; }
  if (cmd !== 'scan') { console.error(`unknown command '${cmd}'\n\n${HELP}`); return 2; }

  let result;
  try {
    result = scan({ root: folder || '.', resourcesDir: opts.resources, cfgPath: opts.cfg });
  } catch (e) {
    console.error(`error: ${e.message}`);
    return 2;
  }
  console.log(renderConsole(result, { color: opts.color, all: opts.all }));
  if (opts.json) {
    writeFileSync(opts.json, renderJson(result));
    console.log(`\nJSON written to ${opts.json}`);
  }
  return result.findings.some((f) => f.severity === 'error') ? 1 : 0;
}

process.exitCode = main();
