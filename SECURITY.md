# Security policy

## Secrets

uNews must never store bot tokens, personal access tokens, API keys, private keys, passwords, numeric private chat identifiers or local environment files in Git.

Runtime credentials belong only in GitHub Actions encrypted secrets. The publisher receives them only in the two steps that validate Telegram access and send posts. Dry-run and pull-request checks do not receive Telegram credentials.

Do not paste credentials into patchnotes, screenshots, issue bodies, commit messages or Action inputs.

## Rotation

The built-in GitHub Actions token is job-scoped and expires automatically. Telegram bot tokens do not have a fixed calendar expiry. Rotate a Telegram token immediately if it was exposed, sent to another person, included in a file, or used on an untrusted device. After rotation, replace the encrypted repository secret and run the credential diagnostic.

## Reporting

Do not open a public issue containing a suspected credential. Report a vulnerability privately through [GitHub Security Advisories](https://github.com/sunpole/uNews/security/advisories/new), then rotate the affected credential before investigating logs.

## Repository controls

Changes to workflows, publishing scripts and project discovery configuration are owned by `@sunpole` through `.github/CODEOWNERS`. Branch protection should require owner review for these paths.
