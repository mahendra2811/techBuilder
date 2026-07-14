# Merchant seed folder (WP-10)

Copy this folder to `backend/merchants/<code>/`, fill the CSVs with the customer's real data
(export from Excel as CSV), then run from `backend/`:

    npm run seed:merchant -- merchants/<code>

**Rules**
- `users.csv` must contain exactly one OWNER. Every user gets `tempPassword` + forced change on first login.
- Person names must be UNIQUE (add surname/village if needed) — they link crews, wages, drivers.
- `weeklyOff`: day numbers 0=Sunday…6=Saturday, multiple as `0|3`.
- `dailyWageRs` in RUPEES (converted to paise + a wage_rate effective today).
- Links: sites.siteManagerUsername + crews.supervisorUsername → users.csv usernames ·
  people.crew + users.crew → crews.csv name · vehicles.driverName + users.personName → people.csv name ·
  users.site + crews.site + vehicles.site → sites.csv code.
- Values containing commas must be "quoted".
- The script ABORTS if the org code already exists (no partial re-seed).
