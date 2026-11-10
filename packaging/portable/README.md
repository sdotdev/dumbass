# Dumbass UX portable skills

This bundle contains eight self-contained Agent Skills. Install all of them into a host-compatible skills directory:

```bash
node install.mjs --target /path/to/skills
```

Install a subset with `--skills dumbass-audit,dumbass-novice`. Existing destinations are preserved unless `--force` is supplied. `SHA256SUMS.json` records every distributed file.

The portable bundle supplies instructions and contracts. Enforced screenshot-only isolation requires a compatible trusted runner. General, dashboard, and mobile-web audits are included; mobile-web results do not establish native-app behavior.

License: Apache-2.0. Project source and full documentation: <https://github.com/sdotdev/dumbass>.
