# ShipCheck fixture sites

This localhost-only server supplies deterministic pages for public-web adapter
tests. `startFixtureServer()` binds an ephemeral port on `127.0.0.1`; it is not
a production service and does not weaken ShipCheck's HTTPS-only target policy.

Canonical fixtures include a complete page, missing pricing, a broken docs
link, successful/failed/silent waitlist forms, mobile overflow, broken images,
and severe console errors. Hostile fixtures cover a private-network redirect,
redirect loop, destructive form, popup storm, and slow response. Tests must
always close the returned server handle.
