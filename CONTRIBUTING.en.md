# Contributing

Thank you for your interest in Fristenrechner Vergabe. This page describes how contributions work.

[Deutsche Fassung](CONTRIBUTING.md)

## What the project is

A calculation aid for deadlines in public procurement procedures under German law. The software is non-binding, it is no legal advice, and all information is provided without guarantee. The publisher is BAREMOS IT GmbH, the license is Apache-2.0.

The user interface and the documents in `docs` are in German. Issues and pull requests are welcome in German or English.

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

## Rules for changes to the rules of calculation

- Every deadline rule names its legal basis with the exact reference.
- Every change to a rule has a test that proves it.
- No value is estimated. Without a reliable source, the rule stays unchanged.
- Only the person responsible for the content raises the rule version and the date of the legal status.

## Rules for dependencies

The app is meant to be published on F-Droid. Every dependency must be under a free license and work without proprietary services. The app does not access the network during operation.

## Rules for texts

Texts describe what the software calculates. They promise neither legal certainty nor advice. The maintainers check every public text before publication and adjust wordings where needed.

## Rules for files taken from other sources

Files from other sources are checked before they are first committed. The checkpoints are in [docs/uebernahmepruefung.md](docs/uebernahmepruefung.md).

## Build and test

| Step | Command |
|---|---|
| Install dependencies | `npm ci` |
| Tests | `npm test` |
| Type check | `npm run check` |
| Build the packages | `npm run build` |
| Check the tools for the Android build | `node scripts/android-build.mjs --nur-pruefen` |

The commands work without private files. The versions of the tools are in [docs/toolchain.md](docs/toolchain.md).

- Dependencies are listed with their exact version in the manifests. Changes to the lockfile are made with the reference version of npm.
- A new version is adopted only after it has been published for at least seven days.
- Install scripts of packages do not run.

## License of contributions

Contributions are under the same license as the project, Apache-2.0.
