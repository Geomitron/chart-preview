# Releasing

This project uses [Changesets](https://github.com/changesets/changesets) for versioning and publishing.

## How to Release

### 1. Create a Changeset

After making changes you want to release:

```bash
npx changeset
```

- Select the version bump: `patch` (bug fix), `minor` (new feature), or `major` (breaking change)
- Write a short summary of the changes

This creates a file in `.changeset/` — commit it with your changes.

### 2. Push to `main`

```bash
git add .
git commit -m "Your commit message"
git push
```

### 3. Merge the Version PR

GitHub Actions will create a **"Version Packages"** PR that:

- Bumps the version in `package.json`
- Updates `CHANGELOG.md`

Merge this PR to publish to npm automatically.

## Version Bump Guide

| Type    | When to Use                         | Example       |
| ------- | ----------------------------------- | ------------- |
| `patch` | Bug fixes, minor tweaks             | 1.0.0 → 1.0.1 |
| `minor` | New features (backwards compatible) | 1.0.0 → 1.1.0 |
| `major` | Breaking changes                    | 1.0.0 → 2.0.0 |
