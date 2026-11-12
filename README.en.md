# Haven Kit

[中文](README.md) · [English](README.en.md)

A foundation for model contracts, editing runtime and Angular interfaces. Haven Kit defines shared semantics for fields, tables, trees, validation and editing so that APIs and interfaces operate on consistent structures and rules.

## Features

- Schema contracts for documents and editing, JSON Schema generation and field/component validation.
- Runtime support for model processing, normalization and shared editing behavior.
- Angular UI components and themes for forms, tables and trees.
- Richer structures for localization, rich text, choices, temporal values, assets and relationships.
- Editing semantics for commands, validation, candidate changes and history.
- Package boundaries backed by independent builds, type checks, unit/UI tests and consumer-package tests.

## Quick start

Node.js `>=26.13.0 <27` and pnpm `12.18.0`.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
```

## Configuration

| Setting | Purpose |
| --- | --- |
| `packages/schema/` | Types, contracts and generated JSON Schema. |
| `packages/runtime/` | Runtime and shared editing logic. |
| `packages/ui/` | Angular UI components. |
| `tools/` | Schema generation, boundary checks and package-consumer verification. |

## Usage

Applications consume `@haven/schema`, `@haven/runtime` and `@haven/ui` as needed. Haven API and Haven Studio use matching package versions. Build locally and distribute through your own package registry; each package’s `package.json` defines its version and exports.

## Project structure

- `packages/` — Three shared packages
- `tools/browser/` — Browser-test fixtures

## License

[PolyForm Noncommercial 1.0.0](LICENSE). See [LICENSE_SCOPE.md](LICENSE_SCOPE.md) for the scope of original material and third-party components, and the accompanying notices for third-party copyrights and licenses.
