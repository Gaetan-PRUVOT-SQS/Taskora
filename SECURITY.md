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
- Running HTTPS in production. Session cookies are `Secure` and `__Host-` prefixed, so browsers only keep them over HTTPS (or on `localhost`)  
- Serving the front end and the API from the same origin (the bundled nginx does it). If they live on different origins, list the front end in `TRUSTED_ORIGINS`, otherwise requests that change data are refused by the origin check  
- Disabling accounts with `npm run admin -- disable <email>` instead of only deleting data; it cuts every session at once  
- Restricting network access to the instance  
- Granting the instance admin role only to trusted operators (`npm run admin -- grant <email>` in `backend/`); only admins can download the instance backup  
- Setting `REGISTRATION_OPEN=false` when the instance should not accept public sign ups  
- Backing up the PostgreSQL database with `pg_dump` (the in app backup leaves out password hashes, OAuth ids and invite tokens)  

## Project

- **Product:** Taskora  
- **Organization:** SigmaQuantSystems  
- **Repository:** https://github.com/Gaetan-PRUVOT-SQS/Taskora  
