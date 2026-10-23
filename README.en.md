# Fristenrechner Vergabe

A calculation aid for dates and deadlines in public procurement procedures (tenders) under German law: VgV, VOB/A, SektVO, UVgO and further procurement regulations. Published by BAREMOS IT GmbH, Berlin. The English name is "Procurement Deadline Calculator (Germany)".

[Deutsche Fassung](README.md)

> The calculator is a non-binding calculation aid. It does not replace legal advice. All information is provided without guarantee.

The user interface of the app and its exports are in German. The calculator follows German procurement law, and its technical terms are German.

## Status

Version 0.1.1 of the npm packages `@baremos/fristenrechner-kern` and `@baremos/fristenrechner-ui` is published; the first version was released on 2026-10-16. Version 1.0.0 of the Android app is available as a signed APK in the [GitHub release v1.0.0](https://github.com/baremos/fristenrechner/releases/tag/v1.0.0). The release notes list the file checksum and the fingerprint of the signing certificate. The app is not yet published on Google Play or F-Droid.

| Part | Status |
|---|---|
| Tools and versions | defined, see [docs/toolchain.md](docs/toolchain.md) |
| Project scaffold | in place |
| Calculation core | in place, with tests and reference cases |
| User interface | in place, with interfaces for saving, importing and exporting |
| Android app | version 1.0.0 available as a signed APK in the GitHub release; Save as, separate sharing actions and project import are implemented and tested in the emulator on API 30 and 36 and on a device with Android 16, with documented limitations |

The work packages are listed in [docs/arbeitspakete.md](docs/arbeitspakete.md). The documents in the folder `docs` are in German.

## What the software will calculate

This section describes the scope of version 1. The repository implements the calculation core, the user interface and the app project for Android, including the file workflows. Initial tests on a physical device with Android 16 have been carried out; further tests are outstanding, see [docs/app.md](docs/app.md#prüfung-auf-einem-gerät).

From the data entered, the software produces a schedule of dates and deadlines for a procurement procedure. Version 1 calculates the same as the [calculator on www.baremos.de](https://www.baremos.de/de/vergabe/fristenrechner/). The scope is defined in [docs/zuschnitt-v1.md](docs/zuschnitt-v1.md).

| Area | Content |
|---|---|
| Procurement regulations | VgV, VOB/A-EU, SektVO, VSVgV, KonzVgV, UVgO, VOB/A |
| Selection | The user selects the procurement regulation and the type of procedure |
| Public holidays | statutory public holidays per federal state, calculated without network access |
| Output | PDF, Excel and project file |
| Traceability | Every calculation and every export states the rule version and the date of the legal status |

## Files and privacy in the app

“Projekt exportieren”, “Excel exportieren” and “PDF exportieren” open the Android picker to save under a chosen name and at a chosen location. The separate actions “Projekt teilen”, “Excel teilen” and “PDF teilen” make the respective file available to a selected target app; the message does not confirm that it has been sent. “Projekt importieren” opens a JSON project file through the Android picker, with a limit of 1 MiB. Cancelling preserves the existing project.

The current project is saved in the local storage of the WebView. The app has no internet permission; selected document providers and target apps may transfer data themselves. [Privacy](docs/datenschutz.md) describes temporary file cleanup, backup, device migration and deletion limits. The same German text is available offline in the app under “Datenschutz”.

The emulator evidence and its limitations are documented in [docs/app.md](docs/app.md#dateiphase-auf-api-30-und-36), and the outstanding tests in [docs/testmatrix.md](docs/testmatrix.md). These runs do not replace tests of physical devices, document providers and receiving applications.

## What the software will not do

- It does not remind of dates and sends no notifications.
- It does not select the procurement regulation from the contract value.
- It contains no amounts of the EU thresholds.
- It has no accounts, no login and no synchronisation.
- It contains no tracking, no advertising and no analytics.
- It does not access the network during operation.

## Structure

The table lists the folders and their content. The app is described in [docs/app.md](docs/app.md).

| Folder | Content | Package name |
|---|---|---|
| `packages/kern` | Calculation core, TypeScript without dependencies, with tests | `@baremos/fristenrechner-kern` |
| `packages/oberflaeche` | User interface, operating logic, exports | `@baremos/fristenrechner-ui` |
| `app` | Astro project with Capacitor for Android | App ID `de.baremos.fristenrechner` |
| `scripts` | Scripts for setup, build and checks | – |
| `docs` | Definitions and evidence | – |

Website and app are meant to use the same calculation core and the same user interface. The user interface knows no platform: the embedding project hands it the means for saving, importing and exporting.

## Requirements

| Tool | Version |
|---|---|
| Node.js | 24.21.0 as reference; supported are the 22 line from 22.23.2 and the 24 line from 24.18.1 |
| npm | 11.19.0 as reference; `npm ci` also runs with npm 10.9 |
| JDK | 21, a free OpenJDK distribution, for the Android build and the tests of the scripts |
| Android SDK | a project SDK of its own, setup see [docs/toolchain.md](docs/toolchain.md) |
| Python | 3.9 or later, for the scripts under Linux and for part of the tests of the scripts. Without it, these tests are skipped. |

All versions and the reasons for them are in [docs/toolchain.md](docs/toolchain.md).

## Build and test

| Step | Command | Note |
|---|---|---|
| Install dependencies | `npm ci` | – |
| Tests | `npm test` | tests the scripts, the calculation core, the user interface and the app |
| Type check | `npm run check` | calculation core, user interface and app |
| Build the packages and the page of the app | `npm run build` | also checks the configuration and the built web files of the app |
| Check the licenses of the dependencies | `npm run lizenzen` | see [docs/lizenzen.md](docs/lizenzen.md) |
| Check the tools for the Android build | `node scripts/android-build.mjs --nur-pruefen` | needs the JDK and the project SDK |
| Build the Android app, debug | `node scripts/app-bauen.mjs --android` | web build, transfer to Android, Gradle and the checks of the build chain in one run |
| Build the Android app, unsigned release | `node scripts/app-bauen.mjs --android --aufgabe assembleRelease` | with `--streng` only if Node, the JDK and the SDK packages match the pinned versions; the build does not check the npm version |
| Check the app in the emulator | `node scripts/emulator-lauf.mjs` | under Windows; call and scope in [docs/app.md](docs/app.md) |
| Check the app on a device | `node scripts/geraet-lauf.mjs` | under Windows, via USB and without root; call and scope in [docs/app.md](docs/app.md) |

Build and tests need no private files. `npm ci` downloads the dependencies from the network; the Android build additionally downloads its tools. The app itself has no permission for network access. What has been checked in the emulator in this respect, and what has not, is described in [docs/app.md](docs/app.md).

## Maintenance of the rules

An installed app stays at the version the user last downloaded. [docs/pflegekonzept.md](docs/pflegekonzept.md) therefore defines who checks the deadline rules, when this happens and how a change reaches the users. Andreas Schmidt, BAREMOS IT GmbH, is responsible for the content.

## Contributing

Bug reports and contributions are welcome. The process is described in [CONTRIBUTING.en.md](CONTRIBUTING.en.md).

## License

Apache License 2.0. The text is in the file [LICENSE](LICENSE). The file [NOTICE](NOTICE) names the publisher.
