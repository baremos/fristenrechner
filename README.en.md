# Fristenrechner Vergabe

A calculation aid for dates and deadlines in public procurement procedures under German law. Published by BAREMOS IT GmbH, Berlin. The English name is "Procurement Deadline Calculator (Germany)".

[Deutsche Fassung](README.md)

> The calculator is a non-binding calculation aid. It does not replace legal advice. All information is provided without guarantee.

The user interface of the app and its exports are in German. The calculator follows German procurement law, and its technical terms are German.

## Status

The repository is under construction. Nothing has been released yet.

| Part | Status |
|---|---|
| Tools and versions | defined, see [docs/toolchain.md](docs/toolchain.md) |
| Project scaffold | in place |
| Calculation core | to follow |
| User interface | to follow |
| Android app | to follow |

The work packages are listed in [docs/arbeitspakete.md](docs/arbeitspakete.md). The documents in the folder `docs` are in German.

## What the software will calculate

This section describes the scope of version 1. It is not yet implemented in the repository.

From the data entered, the software produces a schedule of dates and deadlines for a procurement procedure. Version 1 calculates the same as the [calculator on www.baremos.de](https://www.baremos.de/de/vergabe/fristenrechner/). The scope is defined in [docs/zuschnitt-v1.md](docs/zuschnitt-v1.md).

| Area | Content |
|---|---|
| Procurement regulations | VgV, VOB/A-EU, SektVO, VSVgV, KonzVgV, UVgO, VOB/A |
| Selection | The user selects the procurement regulation and the type of procedure |
| Public holidays | statutory public holidays per federal state, calculated without network access |
| Output | PDF, Excel and project file |
| Traceability | Every calculation and every export states the rule version and the date of the legal status |

## What the software will not do

- It does not remind of dates and sends no notifications.
- It does not select the procurement regulation from the contract value.
- It contains no amounts of the EU thresholds.
- It has no accounts, no login and no synchronisation.
- It contains no tracking, no advertising and no analytics.
- It does not access the network during operation.

## Structure

So far, the folders of the packages and of the app contain only their manifest. The table states the intended content.

| Folder | Content | Package name |
|---|---|---|
| `packages/kern` | Calculation core, TypeScript without dependencies, with tests | `@baremos/fristenrechner-kern` |
| `packages/oberflaeche` | User interface, operating logic, exports | `@baremos/fristenrechner-ui` |
| `app` | Astro project with Capacitor for Android | App ID `de.baremos.fristenrechner` |
| `scripts` | Scripts for setup, build and checks | – |
| `docs` | Definitions and evidence | – |

Website and app are meant to use the same calculation core and the same user interface.

## Requirements

| Tool | Version |
|---|---|
| Node.js | 24.21.0 as reference; supported are the 22 line from 22.23.2 and the 24 line from 24.18.1 |
| npm | 11.19.0 as reference; `npm ci` also runs with npm 10.9 |
| JDK | 21, a free OpenJDK distribution, for the Android build and the tests of the scripts |
| Android SDK | a project SDK of its own, setup see [docs/toolchain.md](docs/toolchain.md) |

All versions and the reasons for them are in [docs/toolchain.md](docs/toolchain.md).

## Build and test

| Step | Command | Status |
|---|---|---|
| Install dependencies | `npm ci` | works |
| Tests | `npm test` | works, so far it tests the scripts |
| Type check | `npm run check` | runs without effect until the packages bring a type check |
| Build the packages | `npm run build` | runs without effect until the packages bring a build |
| Check the tools for the Android build | `node scripts/android-build.mjs --nur-pruefen` | needs the Android project in `app/android`, which follows with the app |
| Build the Android app | `node scripts/android-build.mjs` | needs the Android project in `app/android`, which follows with the app |

Build and tests need no private files. The build downloads tools and dependencies from the network. The app itself is meant not to access the network during operation.

## Maintenance of the rules

An installed app stays at the version the user last downloaded. [docs/pflegekonzept.md](docs/pflegekonzept.md) therefore defines who checks the deadline rules, when this happens and how a change reaches the users. Andreas Schmidt, BAREMOS IT GmbH, is responsible for the content.

## Contributing

Bug reports and contributions are welcome. The process is described in [CONTRIBUTING.en.md](CONTRIBUTING.en.md).

## License

Apache License 2.0. The text is in the file [LICENSE](LICENSE). The file [NOTICE](NOTICE) names the creator.
