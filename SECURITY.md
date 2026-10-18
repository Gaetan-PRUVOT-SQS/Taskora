# Security policy

## Supported versions

| Version | Supported |
|---------|-----------|
| `main` (development) | Yes |
| Tagged releases `v0.x` | Yes (latest tag preferred) |

## Reporting a vulnerability

**Do not** open a public GitHub issue for security vulnerabilities.

Please report security issues privately:

1. Prefer **GitHub Security Advisories** on the repository:  
   https://github.com/Gaetan-PRUVOT-SQS/Taskora/security/advisories/new  
2. Or contact the maintainer via GitHub:  
   https://github.com/Gaetan-PRUVOT-SQS  

Include:

- Description of the issue  
- Steps to reproduce  
- Impact assessment if known  
- Suggested fix if you have one  

## What to expect

- Acknowledgement when possible within a few days  
- Coordinated disclosure after a fix is available  
- Credit in the changelog if you wish to be named  

## Scope notes (self-host)

Taskora is designed for self-hosted deployments. Operators are responsible for:

- Setting their own `JWT_SECRET` (at least 32 random bytes) and keeping it private. There is no default value; the server refuses to start without a strong secret. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`. Changing it logs every user out.  
- Running HTTPS in production  
- Restricting network access to the instance  
- Backing up the SQLite database  

## Project

- **Product:** Taskora  
- **Organization:** SigmaQuantSystems  
- **Repository:** https://github.com/Gaetan-PRUVOT-SQS/Taskora  
