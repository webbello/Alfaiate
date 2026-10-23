# Plan: Admin redesign (TailAdmin style, faster forms)

Spec: [docs/SPEC-admin-redesign.md](../docs/SPEC-admin-redesign.md), approved 2026-10-23. Defaults taken from the spec's proposals where the owner gave no other answer: admin-only blue palette, light theme only, whole admin in five slices, tailor page on one two-column page (no tabs, no JavaScript), essentials = name, one phone/WhatsApp number, area, work types, portal later. Change any of these and the affected task changes.

## Approach

Markup and CSS only. Handlers, permissions, CSRF, audit and SQL are not touched, so the existing permission tests and `admin-contract.baseline.json` are the safety net. Each slice leaves the whole admin working and green; the shell lands first so every page gets the new frame at once.

## Dependency order

```
T1 tokens + shell (sidebar, top bar, mobile menu)  ->  T2 components (Card, FormGrid, Field, StickyBar, chips, tables)
   ->  T3 dashboard + lists  ->  T4 tailor create (essentials) ->  T5 tailor edit (two columns, status card)
   ->  T6 enquiry detail + referrals  ->  T7 small pages + login  ->  T8 audit pass (axe, reflow, contrast, budget, docs)
```

T3, T4 and T6 only need T1 and T2 and could run in parallel by file, but they share `admin.css`, so build them one at a time.

## Risks and mitigation

| Risk | Mitigation |
|---|---|
| Existing tests read admin markup | Update expectations in the same task; never delete a permission or CSRF test |
| Mobile sidebar without JavaScript | CSS-only `<details>` pattern, keyboard and axe tested in T1 |
| New palette fails contrast | Contrast test for admin tokens in T1 before any page uses them |
| Merged create flow drops a field | Spec "Ask first": list of fields kept/folded is shown for approval in T4 |
| Strict CSP | No inline style or script; checked by existing csp e2e |
| Admin CSS grows | Budget measured in T8 (proposed 14 kB) |
| Preview tooling | Use `npm run preview` (port 4322); the dev server blocks inline styles |

## Checkpoints

After T2 (shell and parts visible on every page), after T5 (the biggest saving, click count measured), after T8 (full check and e2e).
