# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/fizzy2562/ConsultantCloud-Revenue-Agent/security/advisories/new),
not in a public issue. Include what an attacker could do, how to reproduce it, and the commit you
tested.

## Scope

This is a demo and reference implementation, not a hosted product. Reports about the code in this
repository are welcome, especially anything that lets the model, a visitor or a forged request:

- run a protected change without the user's confirmation;
- get round the discount policy;
- read or change a Salesforce org it hasn't signed in to;
- read another user's tokens.

How the project handles credentials, confirmation and policy is described in
[docs/security.md](docs/security.md).
