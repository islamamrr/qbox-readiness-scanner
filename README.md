# Qbox Readiness Scanner

**Know what breaks before you switch your FiveM server from QBCore to Qbox.**

Qbox says most QBCore resources work through its bridge. This tool tells you *which of yours* don't. It reads your `resources` folder and `server.cfg` and gives each resource a verdict, then checks the server for missing dependencies, a bad start order and duplicate systems.

- **Offline and read-only.** Nothing is uploaded, nothing on your server is changed, and nothing runs on your live server.
- **Zero dependencies.** Plain Node.js; every line is in this repo.
- **Free and open source** (MIT).

## Quick start

You need [Node.js](https://nodejs.org) 18 or newer. Run it against a copy of your server-data folder:

```bash
git clone https://github.com/islamamrr/qbox-readiness-scanner
cd qbox-readiness-scanner
node bin/qrs.js scan /path/to/server-data
```

Options:

| Option | What it does |
| --- | --- |
| `--resources <dir>` | Resources folder, if it isn't `<folder>/resources` |
| `--cfg <file>` | server.cfg to read (default: `<folder>/server.cfg`) |
| `--json <file>` | Also save the results as JSON |
| `--all` | List every resource's verdict, not only the ones that need work |
| `--no-color` | Plain output |

The exit code is 1 when an error-level problem is found, so you can use it in CI.

## Qbox verdicts

| Verdict | Meaning |
| --- | --- |
| **incompatible** | Would corrupt or fight Qbox's data, for example writing job/gang data straight into `players` or keeping its own multijob tables |
| **adapt** | Works only after changes, for example qb-inventory, qb-target or qb-menu calls, string grade keys, `PlayerData.items` |
| **replace** | The Qbox stack replaces it outright (qb-core → qbx_core, qb-inventory → ox_inventory, qb-target → ox_target, …) |
| **unknown** | Escrowed (encrypted) code: only the manifest and open files could be checked |
| **bridge-OK** | Uses QBCore only through APIs the Qbox bridge covers (needs `setr qbx:enableBridge "true"`) |
| **no QBCore use** | Doesn't touch QBCore at all |

The patterns come from Qbox's own migration docs: [script migration](https://docs.qbox.re/migrating/scripts), [converting resources](https://docs.qbox.re/migrating/converting-resources) and [database](https://docs.qbox.re/migrating/database). Commented-out code is ignored.

## Server checks

| Rule | Check |
| --- | --- |
| SRS001 | A declared dependency isn't installed |
| SRS002 | A resource loads `@other/file.lua` but `other` starts after it |
| SRS003 | A loaded `@resource` file's resource is missing or never started |
| SRS004 | Exports are called on a resource that isn't installed (optional integrations are skipped) |
| SRS005 | Two folders share one resource name |
| SRS006 | Two inventories, phones, targets or voice systems are running |
| SRS007 | Two frameworks are running |
| SRS008 | `ensure [category]` starts resources alphabetically before what they need |
| SRS009 | A resource is ensured but missing, an `exec` file is missing, or resources are never started |
| SRS010 | Manifest problems: legacy `__resource.lua`, no `fx_version`, folders FXServer ignores |
| SRS011 | Legacy SQL wrappers (mysql-async, ghmattimysql) are running |
| SRS012 | Escrowed resources (reported so you know coverage is partial) |
| SRS102 | Dependency cycles |

When the start order needs fixing, it prints a corrected `ensure` block you can paste into server.cfg.

## Example

Run against the included example server (`node bin/qrs.js scan fixtures/qbcore-server`):

```
QBOX READINESS
  1 incompatible  3 adapt  3 replace  1 unknown  2 bridge-OK  6 no QBCore use
  incompatible   my-multijob    writes job/gang data straight into the players table; keeps its own multijob tables
  adapt          [qb]/qb-shops  depends on qb-inventory, which the Qbox bridge doesn't provide; calls qb-inventory exports (2×); …
  adapt          police-job     indexes job/gang grades with string keys; registers a command with the 'god' permission
  replace        qb-inventory   replaced by ox_inventory
  unknown        fancy-hud      escrowed: code is encrypted, only the manifest and open files were checked

SERVER CHECKS  3 errors · 6 warnings · 3 info
  ERROR   SRS002 police-job loads @ox_lib/init.lua but 'ox_lib' starts after it [police-job/fxmanifest.lua:4]
          → ensure ox_lib before police-job, or add dependency 'ox_lib' to its manifest
  WARNING SRS006 2 phone systems are running: lb-phone, qb-phone
          → keep one phone system and point other resources at it
```

## Limits

- It's a static scan: it reads code, it doesn't run it. A verdict is a strong hint, not a guarantee. Always test the migration on a staging server first.
- Escrowed resources can't be read, so they're marked `unknown`.
- If you only want in-server health checks and don't plan to migrate, [unfckd-lite](https://github.com/unfckd/unfckd-lite) does that well.

## Wrong verdict?

[Open an issue](https://github.com/islamamrr/qbox-readiness-scanner/issues) with the resource name and what the scanner said. False verdicts are treated as bugs.

## Development

```bash
npm test                          # node:test suites
node scripts/make-fixtures.mjs fixtures   # rebuild the example servers
```

Not affiliated with Cfx.re, Rockstar Games, the Qbox Project or QBCore.
