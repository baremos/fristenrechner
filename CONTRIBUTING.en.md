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

## Rules for texts

Texts describe what the software calculates. They promise neither legal certainty nor advice. The maintainers check every public text before publication and adjust wordings where needed.

## Rules for files taken from other sources

Files from other sources are checked before they are first committed. The checkpoints are in [docs/uebernahmepruefung.md](docs/uebernahmepruefung.md).

## Build and test

| Step | Command | Status |
|---|---|---|
| Install dependencies | `npm ci` | works |
| Tests | `npm test` | works, tests the scripts and the calculation core |
| Type check | `npm run check` | works for the calculation core |
| Build the packages | `npm run build` | works for the calculation core |
| Check the tools for the Android build | `node scripts/android-build.mjs --nur-pruefen` | needs the Android project in `app/android`, which follows with the app |

The commands work without private files. The versions of the tools are in [docs/toolchain.md](docs/toolchain.md).

- Dependencies are listed with their exact version in the manifests. Changes to the lockfile are made with the reference version of npm.
- A new version is adopted only after it has been published for at least seven days.
- Install scripts of packages do not run.

## License of contributions

Contributions are under the same license as the project, Apache-2.0.
