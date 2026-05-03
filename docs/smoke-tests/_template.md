# <Product> smoke tests

> **Last bulk verification**: YYYY-MM-DD (Name, Vercel preview)

Walk these checks after every non-trivial change to the product's
surface. Format defined in `docs/smoke-tests/README.md`.

## <Section heading — e.g. "Read mode" / "Builder mode" / "Right rail">

#### XYZ-01 — Short test name

**Do**: One sentence describing the user action.

**Expect**: One sentence describing the expected observable result.

**Last verified**: YYYY-MM-DD

#### XYZ-02 — Another test

**Do**: ...

**Expect**: ...

**Last verified**: 

## Known broken

Tests that currently fail. Move them OUT of this section as the
gaps close.

#### XYZ-99 — Test name

**Do**: ...

**Expect**: ...

**Currently**: One line on the failure mode.

**Tracked in**: PR #NN / issue link.

## Retired

Tests that no longer exist (feature removed, behaviour changed). Keep
the ID referenced so old PR descriptions still resolve.

- **XYZ-12** — was: "..." — retired YYYY-MM-DD because <reason>.
