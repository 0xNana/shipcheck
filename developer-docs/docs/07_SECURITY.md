# Security and Threat Model

## Posture

ShipCheck executes untrusted websites in a browser. Treat every target as hostile.

## Primary threats

### SSRF and DNS rebinding

A URL may redirect or resolve to loopback, private networks, cloud metadata, link-local services, or internal control planes.

Controls:

- allow only `https`;
- resolve before navigation;
- reject prohibited IP ranges;
- re-resolve after redirects;
- validate every destination in request interception;
- block non-standard ports;
- block IP literals unless explicitly supported;
- block cloud metadata endpoints.

### Browser escape and worker compromise

Controls:

- patched browser image;
- container isolation;
- non-root user;
- read-only filesystem where possible;
- seccomp/AppArmor;
- no Docker socket;
- no API/payment secrets in worker;
- short-lived workers;
- outbound network policy;
- CPU, memory, process, and time limits.

### Prompt injection from target content

Controls:

- target content is data, never instructions;
- browser execution uses a finite DSL;
- no model-generated JavaScript;
- page text cannot alter system policy;
- page content sent to a model is minimized and delimited.

### Destructive action

Controls:

- explicit action allowlist;
- synthetic form data;
- form classification;
- no checkout, wallet, delete, publish, upload, permission grant, or account action;
- stop before final confirmation where action is ambiguous.

### Evidence leakage

Controls:

- private object storage;
- scoped short-lived URLs;
- tenant authorization;
- retention policy;
- no public indexing;
- secret detection and redaction where appropriate.

### Denial of service

Controls:

- request size limit;
- page/resource budgets;
- navigation timeout;
- maximum pages/popups;
- maximum artifact size;
- concurrency quotas;
- circuit breaker.

### Payment replay

Use official x402 middleware plus request idempotency. Do not implement payment verification manually unless necessary and thoroughly audited.

## Blocked ranges

Block at minimum:

- IPv4 loopback;
- RFC1918;
- link-local;
- carrier-grade NAT;
- multicast;
- IPv6 loopback;
- IPv6 link-local;
- IPv6 unique-local;
- IPv4-mapped private IPv6;
- known metadata service addresses.

## Secrets

Payment and model secrets belong in the API service, not the browser worker. Workers use scoped temporary object-store credentials only.

## Retention defaults

Suggested V1:

- request/receipt metadata: 30 days;
- screenshots/traces: 7 days;
- failure diagnostics: 7 days;
- payment records: accounting policy;
- deletion process available.

## Non-claims

ShipCheck is not:

- penetration testing;
- smart-contract auditing;
- malware analysis;
- phishing protection;
- compliance certification;
- formal verification.
