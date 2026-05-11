# Security Policy

## Reporting a Vulnerability

Thank you for taking the time to responsibly disclose security issues
in StoryScout.

**Preferred channel:** [private vulnerability reports via GitHub
Security Advisories](https://github.com/mleihs/oeaw-press-relevance/security/advisories/new).
This keeps the discussion private until a fix is shipped.

**Alternative:** email matthias.leihs@gmail.com with the subject prefix
`[security] storyscout: …` so the report does not get lost.

Please include:

- A description of the issue
- Steps to reproduce
- The commit hash you tested against
- Your assessment of impact

We aim to acknowledge within **7 days** and to provide a timeline for
a fix within **30 days**. Critical issues (credential exposure, RCE,
data loss) are prioritized.

## Supported Versions

StoryScout is a single-branch (`main`) project. Only the latest
commit on `main` receives security fixes. Forks and older deployments
are responsible for their own backports.

## Out of Scope

The following are not treated as security issues:

- Misconfigurations in self-hosted deployments — see the
  [hardening section](docs/SELF_HOSTING.md#hardening-recommendations)
  of the self-hosting guide
- Vulnerabilities in third-party dependencies that have not been
  exploited via StoryScout's surface — please report upstream
- Theoretical timing attacks on the password gate — the gate is
  anti-bot, not an ACL, see
  [ARCHITECTURE.md § Non-Goals](ARCHITECTURE.md#non-goals)
- DoS via expensive endpoints (e.g. enrichment-batch with huge inputs)
  — these are rate-limit considerations covered in the self-hosting
  guide, not security vulnerabilities

## Coordinated Disclosure

After a fix is shipped, we publish a GitHub Security Advisory crediting
the reporter (unless they prefer anonymity).
