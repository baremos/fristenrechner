# Contributing

Thank you for your interest in Fristenrechner Vergabe. This page describes how contributions work.

[Deutsche Fassung](CONTRIBUTING.md)

## What the project is

A calculation aid for deadlines in public procurement procedures under German law. The software is non-binding, it does not replace legal advice, and all information is provided without guarantee. The publisher is BAREMOS IT GmbH, the license is Apache-2.0.

The user interface and the documents in the folder `docs` are in German. Issues and pull requests are welcome in German and in English.

## Reporting bugs and making suggestions

Please open an issue. Helpful details are:

- the procurement regulation and the type of procedure selected,
- the data entered,
- the expected and the actual result,
- the legal basis on which the expectation rests.

## Submitting changes

1. Fork the repository and create a branch.
2. Make the change, with a test.
3. Run build and tests locally.
4. Open a pull request and describe what changes and why.

## Rules for subject-matter changes

- Every deadline rule names its legal basis with the exact reference.
- Every change to a rule has a test that proves it.
- No value is estimated. Without a reliable source, the rule stays unchanged.
- Only the person responsible for the content raises the rule version and the date of the legal status.
- The reference files in `packages/kern/test/referenz` record what the calculation core calculates. Whoever changes a rule rewrites them with `npm run referenz:schreiben --workspace packages/kern`. The differences are part of the pull request.

## Rules for dependencies

The app is meant to be published on F-Droid. Every dependency must be under a free license and work without proprietary services. The app does not access the network during operation.

The permitted licenses are listed in [docs/lizenzen.md](docs/lizenzen.md). `npm run lizenzen` checks all packages from the lockfile. Whoever adds a dependency runs the check and states in the pull request what the package is needed for.

Anyone who changes Gradle dependencies, the Android Gradle Plugin or the Capacitor version regenerates `app/android/gradle/verification-metadata.xml` on Windows and Linux and reviews every changed checksum. `npm run lizenzen` does not read the Gradle resolution; it checks the license declarations of the Android runtime artifacts recorded in `scripts/hinweise-dritter.json`. The release build with `node scripts/app-bauen.mjs --android --aufgabe assembleRelease` compares the recorded runtime artifacts with the actual Gradle resolution. The resolved runtime modules are listed in [docs/lizenzen.md](docs/lizenzen.md).

## Rules for texts

Texts describe what the software calculates. They promise neither legal certainty nor advice. The maintainers check every public text before publication and adjust wordings where needed.

## Rules for files taken from other sources

Files from other sources are checked before they are first committed. The checkpoints are in [docs/uebernahmepruefung.md](docs/uebernahmepruefung.md).

## Build and test

| Step | Command | Status |
|---|---|---|
| Install dependencies | `npm ci` | works |
| Tests | `npm test` | works, tests the scripts, the calculation core, the user interface and the app |
| Type check | `npm run check` | works for the calculation core, the user interface and the app |
| Tests of the user interface alone | `node node_modules/vitest/vitest.mjs run --root packages/oberflaeche` | works |
| Type check of the user interface alone | `node scripts/astro.mjs check --root packages/oberflaeche` | works |
| Update the Excel reference | `node node_modules/vitest/vitest.mjs run --root packages/oberflaeche test/export-excel.test.ts --update` | only after consciously reviewing a change |
| Browser checks | `node scripts/browser-lauf.mjs --phase alle --browser beide --ausgabe <Folder>` | needs Microsoft Edge or Google Chrome; not part of `npm test` |
| Build the packages | `npm run build` | works for the calculation core and the web part of the app |
| Check the licenses of the dependencies | `npm run lizenzen` | works |
| Check the tools for the Android build | `node scripts/android-build.mjs --nur-pruefen` | needs the JDK and the project SDK |
| Build the Android app, debug | `node scripts/app-bauen.mjs --android` | web build, transfer to Android, Gradle and the checks of the build chain in one run |
| Build the Android app, unsigned release | `node scripts/app-bauen.mjs --android --aufgabe assembleRelease` | with `--streng` only if Node, the JDK and the SDK packages match the pinned versions; the build does not check the npm version |

The individual commands for the user interface require the built calculation core (`npm run build --workspace packages/kern`); `npm test` and `npm run check` build it themselves. The type check of the user interface covers Astro, TypeScript and TypeScript tests. The JavaScript test helper `packages/oberflaeche/test/struktur.mjs` checks the XLSX output using Node's built-in tools; it is not distributed and is not a general-purpose XML reader. The warning about a missing `src/pages` is expected for this component package; the host's sample page checks the page build. The reference under `packages/oberflaeche/test/referenz` contains SHA-256, the list of parts and all XML parts of a fixed example spreadsheet; the data in `packages/oberflaeche/test/beispiel.ts` is fictitious. A missing reference causes the normal test to fail. Update the reference only after consciously reviewing a change, using the `--update` command in the table.

The browser contract test `packages/oberflaeche/test/bedienung.browser.ts` and the browser checks run with `node scripts/browser-lauf.mjs` in Microsoft Edge or Google Chrome without a window. The run builds the test pages into the output folder, starts the browser with name resolution blocked and a discarding proxy, serves the pages from its own server on 127.0.0.1 and writes a log to the specified output folder. It is not part of `npm test` because it requires an installed browser. It does not replace checks by people using a keyboard or screen reader.

- `--phase` selects `vertrag`, `webadapter`, `darstellung` or `tastatur`; `grundlagen` covers the first two, `alle` all four phases.
- `--browser` selects `edge`, `chrome` or `beide`; `--ausgabe <Folder>` sets the output folder.
- Return codes: `0` passed, `1` product finding, `2` measurement error or invalid, `3` documented limitations only, `4` visual review pending, `64` incorrect invocation.
- Each browser and phase gets a folder with `protokoll.json`; the phases `webadapter`, `darstellung` and `tastatur` also store images there, and `darstellung` and `tastatur` additionally `sichtpruefung.json`.
- For the visual review, fill in only `ergebnis` (`bestanden` or `nicht bestanden`), `wer`, `wann` and `bemerkung` for each entry; leave the evidence details and image checksums unchanged.
- Afterwards, `node scripts/browser-lauf-auswertung.mjs --lauf <Folder>` writes `auswertung.json` next to each `protokoll.json` and returns the updated exit code.
- Background requests by the browser without a reliable attribution to a page or to the background make the phase invalid; repeat the run in that case.

With Edge 154 and 155, the `darstellung` phase regularly ends with invalid network evidence, because after about five minutes Edge requests a wallet configuration that cannot be reliably attributed to either the page or the browser background; no connection is made. Chrome runs this phase to completion.

The commands work without private files. The versions of the tools are in [docs/toolchain.md](docs/toolchain.md).

- Dependencies are listed with their exact version in the manifests. Changes to the lockfile are made with the reference version of npm.
- A new version is adopted only after it has been published for at least seven days.
- Install scripts of packages do not run.

## License of contributions

Contributions are under the same license as the project, Apache-2.0.
