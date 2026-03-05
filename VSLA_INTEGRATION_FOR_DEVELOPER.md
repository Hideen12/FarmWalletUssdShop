# VSLA Integration — For the VSLA Database Developer

This document is for the developer building the VSLA (Village Savings and Loan Association) system. FarmWallet Rice Shops connects to **your** VSLA database to consume data and enable USSD-based profile viewing, group lookup, and savings contributions via mobile money.

---

## Overview

FarmWallet is a USSD rice marketplace and mechanization platform. We have added a **VSLA integration** that:

1. **Reads** from your VSLA database to show users their profile, groups, savings, and (for VBAs) upcoming visits
2. **Writes** to your database when users make savings contributions via mobile money (MoMo):
   - Creates `SavingsContribution` records (pending → confirmed on payment success)
   - Updates `GroupWallet.mainBalance` when a contribution is confirmed

Your database remains the **source of truth**. FarmWallet does not create users, groups, or memberships — only contributions initiated through our USSD flow.

---

## Connection

FarmWallet connects to your database only when these environment variables are set:

| Variable | Description |
|----------|-------------|
| `VSL_DB_HOST` | Database host |
| `VSL_DB_NAME` | Database name |
| `VSL_DB_USER` | Username |
| `VSL_DB_PASSWORD` | Password |
| `VSL_DB_PORT` | Port (default: 3306) |
| `VSL_DB_DIALECT` | Dialect (default: mysql) |

If any required variable is missing, FarmWallet does not connect and the VSLA USSD option is hidden.

---

## Tables FarmWallet Uses

### Read-only (FarmWallet only reads)

| Table | Columns used | Purpose |
|-------|--------------|---------|
| `users` | id, fullname, phoneNumber, userType, status, isDeleted | Look up user by phone; show profile |
| `groups` | id, name, isActive, group_code | List groups; direct shortcode lookup |
| `group_members` | id, groupId, userId, joinedAt | Check membership; list user's groups |
| `vba_group_assignments` | id, vbaId, groupId, assignedAt | List groups assigned to VBA |
| `vba_visits` | id, vbaId, scheduleCode, groupId, farmerId, typeOfVisit, purpose, scheduledAt, scheduledTime, status | List VBA's upcoming visits |

### Read and write

| Table | FarmWallet actions |
|-------|--------------------|
| `savings_contributions` | **INSERT** new rows (paymentMethod: momo, status: pending). **UPDATE** status to confirmed/failed when MoMo payment completes. |
| `group_wallets` | **UPDATE** mainBalance (increment by contribution amount when payment succeeds) |

---

## Column Expectations

### users
- `phoneNumber` — Used for lookup. FarmWallet accepts both `0555227753` and `233555227753` formats.
- `userType` — `farmer`, `input_dealer`, `vsla_leader`, or `vba`. Determines menu options (e.g. VBAs see "Assigned Groups" and "Upcoming Visits"; others see "My Groups" and "My Savings").
- `isDeleted` — FarmWallet filters out deleted users (`WHERE isDeleted = false`).

### groups
- `group_code` (optional) — Present in our model; not currently used for shortcode routing (FarmWallet uses its own `ussd_extensions` table for that).
- `isActive` — FarmWallet only shows active groups for contributions.

### savings_contributions
- `paymentMethod` — FarmWallet uses `'momo'` only (not `'wallet'`).
- `reference` — FarmWallet stores a unique reference (e.g. `SAV-1731234567890-abc123`) for Paystack webhook lookup.
- `status` — FarmWallet sets `pending` on create, then `confirmed` or `failed` when MoMo payment completes.
- `virtualWalletId` — Not used by FarmWallet (we use momo only).

### group_wallets
- `groupId` — Links to the group.
- `mainBalance` — FarmWallet increments this by the contribution amount when payment succeeds.

---

## USSD Flow (What the User Sees)

When a user dials **\*920*72#** and selects **6. VSLA - My Profile**:

1. **Lookup by phone** — FarmWallet looks up the user in `users` by `phoneNumber`. If not found or `isDeleted`, the session ends with an error.

2. **VSLA menu** (depends on `userType`):
   - **Farmer / Input dealer / VSLA leader:** My Profile, My Groups, My Savings, Make Contribution
   - **VBA:** My Profile, Assigned Groups, Upcoming Visits

3. **My Profile** — Shows `fullname`, `userType`, `status` from `users`.

4. **My Groups** — For farmers: from `group_members` + `groups`. For VBAs: from `vba_group_assignments` + `groups`.

5. **My Savings** — Sum of `savings_contributions` where `userId` = current user and `status = 'confirmed'`, grouped by `groupId`.

6. **Upcoming Visits** (VBA only) — From `vba_visits` where `vbaId` = current user, `status = 'scheduled'`, `scheduledAt` >= today.

7. **Make Contribution** — User selects a group (from their memberships), enters amount, selects MoMo provider. FarmWallet:
   - Inserts `savings_contributions` (status: pending, reference: SAV-xxx)
   - Initiates Paystack charge
   - On webhook `charge.success`: updates contribution to confirmed, increments `group_wallets.mainBalance`
   - On webhook `charge.failed`: updates contribution to failed

---

## Direct Group Shortcode

FarmWallet maintains an `ussd_extensions` table in **its own database** that maps extensions (100, 101, 102, …) to your VSLA group IDs. When a user dials **\*920*72*100#**, FarmWallet:

1. Looks up extension `100` in `ussd_extensions` (entity_type: `group`, entity_ref: your group UUID)
2. Loads the group from your `groups` table
3. Verifies the user is a member via `group_members`
4. If valid, shows the contribution flow for that group

Extensions for groups are assigned when you run `npm run add-ussd-extensions` — it assigns 100, 101, 102, … to your active groups in order. Your `groups.group_code` column exists in our model but is not currently used for shortcode routing; the mapping lives in FarmWallet's `ussd_extensions` table. If you add new groups, re-running the script will register them.

---

## Payment Flow (Contributions)

1. User selects group, enters amount (GHS), selects MoMo provider (MTN/Vodafone/AirtelTigo).
2. FarmWallet **INSERT**s into `savings_contributions`:
   - `groupId`, `userId`, `amount`, `paymentMethod: 'momo'`, `reference: 'SAV-...'`, `status: 'pending'`
3. FarmWallet sends a Paystack charge to the user's phone.
4. User completes payment on their phone.
5. Paystack sends a webhook to FarmWallet.
6. FarmWallet **UPDATE**s the contribution: `status = 'confirmed'` (or `'failed'`).
7. If confirmed, FarmWallet **UPDATE**s `group_wallets`: `mainBalance += amount` for that `groupId`.

All writes use a database transaction so that contribution and wallet updates succeed or fail together.

---

## What You Need to Provide

1. **Database access** — Read/write credentials for the tables above. FarmWallet needs:
   - SELECT on: users, groups, group_members, vba_group_assignments, vba_visits, savings_contributions, group_wallets
   - INSERT/UPDATE on: savings_contributions, group_wallets

2. **Schema alignment** — Table and column names should match (or we can adjust our models). We expect:
   - `users` (or your equivalent)
   - `groups` (with optional `group_code`)
   - `group_members`
   - `group_wallets` (one row per group)
   - `savings_contributions`
   - `vba_group_assignments`
   - `vba_visits`

3. **Phone format** — FarmWallet normalizes phone numbers (e.g. `0555227753` ↔ `233555227753`). Ensure your `users.phoneNumber` values are consistent, or we can align on a single format.

4. **User registration** — FarmWallet does **not** create users. Users must be registered in your system first. If a phone is not found, the USSD shows: "Phone not found in VSLA system. Register with your VSL/VBA first."

---

## Summary

| FarmWallet action | Your database |
|-------------------|---------------|
| Look up user by phone | SELECT from users |
| List user's groups | SELECT from group_members + groups (or vba_group_assignments for VBAs) |
| Show savings totals | SELECT from savings_contributions (aggregated) |
| Show VBA visits | SELECT from vba_visits |
| Create contribution | INSERT into savings_contributions |
| Confirm contribution | UPDATE savings_contributions SET status='confirmed' |
| Update group wallet | UPDATE group_wallets SET mainBalance = mainBalance + amount |

Your VSLA application remains the primary system. FarmWallet is a consumer of your data and a channel for MoMo-based contributions via USSD.
