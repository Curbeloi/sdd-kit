## Description

Brief description of what this PR does.

**Related Issue:** Closes #___

## SDD Spec

> ⚠️ **Every code PR must include an SDD spec.** PRs without specs will be rejected (unless docs/deps-only).

- **Spec file**: `specs/<your-spec-filename>.spec.md`
- **Generated with**: `sdd spec create --size <small|medium|large>`
- **Architecture reviewed** (medium/large): Yes / No / N/A

## Type of Change

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would break existing functionality)
- [ ] 📝 Documentation update (no spec required)
- [ ] 🔧 Refactor (no functional changes)
- [ ] ✅ Test update
- [ ] 📦 Dependency update (no spec required)

## Changes Made

- Change 1
- Change 2
- Change 3

## How to Test

```bash
# Steps to verify the changes
sdd <command> [flags]
```

## Checklist

### SDD Compliance (The Golden Rule)
- [ ] I generated my spec using `sdd spec create` before writing code
- [ ] My spec file is included in the `specs/` directory
- [ ] My implementation follows the spec
- [ ] I ran `sdd arch` and verified architectural fit (medium/large changes)

### Code Quality
- [ ] I've read the [CONTRIBUTING](CONTRIBUTING.md) guidelines
- [ ] My code follows the project's coding standards (ESM, async/await, etc.)
- [ ] I've added/updated tests for my changes
- [ ] All tests pass (`pnpm test`)
- [ ] The CLI remains language-agnostic (no framework-specific assumptions)
- [ ] Works on Node.js >= 18
- [ ] I've updated documentation if needed
- [ ] My commits follow the [Conventional Commits](https://www.conventionalcommits.org/) convention
- [ ] No unnecessary dependencies were added

## Screenshots / Output (if applicable)

```
Paste CLI output here
```
