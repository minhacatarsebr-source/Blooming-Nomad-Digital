# Lead CRM for Meta Lead Ads (Google Sheets + Apps Script)

A reusable mini CRM in Google Sheets for leads generated with Meta Instant Forms.
One spreadsheet per client. The agency installs it; the client's sales team works in the `CRM` tab.

## Status of this version

| Area | Status |
|---|---|
| Spreadsheet structure (7 tabs, dropdowns, highlighting) | Implemented |
| RAW_LEADS → CRM sync, duplicate checks, phone/email normalisation | Implemented |
| Configurable lead scoring, priority, assignment | Implemented |
| Follow-up log, contact cadence, automatic closing as Lost | Implemented |
| Dashboard, email / Telegram notifications, daily report | Implemented |
| GDPR anonymisation of old Lost leads | Implemented |
| Make.com scenario (Meta → RAW_LEADS) | **Not built yet.** Leads are pasted into `RAW_LEADS` for now |
| Ad spend import (Cost per Lead / Qualified Lead / Sale) | **Not built yet** |
| Meta Conversions API | **Phase 2, not built yet** |

**Testing status.** The business logic and the full flow are covered by automated tests
that run against an in-memory simulation of Google Sheets (`node --test lead-crm/tests/*.test.js`,
19 tests). The code has **not yet been run inside a real Google spreadsheet**. Do the
[first-install checklist](#5-first-install-checklist) before giving a copy to a client.

## 1. Tabs

| Tab | Who writes | Purpose |
|---|---|---|
| `RAW_LEADS` | Make.com / agency | Original data from Meta. Never edited by salespeople. |
| `CRM` | System + salespeople | Working pipeline: one row per lead. |
| `LEAD_SCORING` | Agency | Scoring rules for this client. |
| `FOLLOW_UP_LOG` | System | History of every contact attempt. |
| `DASHBOARD` | System | Executive figures and charts. No personal data. |
| `SETTINGS` | Agency | Client configuration and dropdown lists. |
| `SYSTEM_LOG` | System | Audit trail and errors (Lead IDs only, no personal data). |

Exact column names and order are defined in [`apps-script/01_Config.gs`](apps-script/01_Config.gs)
and are created by the setup function, so nothing has to be typed by hand.

`RAW_LEADS` accepts extra columns to the right for the client's custom form questions.
Scoring rules can use any of them by column name.

## 2. Installation (once per client)

1. Create a new Google Sheet named after the client.
2. **Extensions → Apps Script.** Delete the default `Code.gs`.
3. For each file in [`apps-script/`](apps-script/), create a file with the same name and paste its content:
   - `.gs` files: **+ → Script** (type the name without `.gs`), in the order `01_Config` … `08_Privacy`.
   - `FollowUpDialog.html`: **+ → HTML**, name it exactly `FollowUpDialog`.
   - `appsscript.json`: **Project Settings → Show "appsscript.json" manifest file**, then replace its
     content. Change `timeZone` to the client's zone (for example `Europe/Lisbon`); it controls the hour of the daily report.
4. In the editor choose the function `setupSpreadsheet` and press **Run**. Accept the permission request
   (Google shows an "unverified app" warning for private scripts: *Advanced → Go to project*).
5. Reload the spreadsheet. A **Lead CRM** menu appears.
6. Fill the `SETTINGS` tab: client name, country, time zone, salespeople (column E) and their emails (column F).
   Run **Lead CRM → Setup → Run initial setup** again to apply the time zone. Re-running never overwrites data.
7. Adjust `LEAD_SCORING` for the client (section 4).
8. **Lead CRM → Setup → Install automatic triggers.** This creates:
   - `syncNewLeads` every 5 minutes,
   - `runMaintenance` every hour (priorities, automatic closing, dashboard),
   - `sendDailyReport` every day at 08:00 (only sends when *Daily Report* is `YES`).

For the next client, use **File → Make a copy** of a configured spreadsheet (the script is copied with it),
clear the data tabs, edit `SETTINGS`, and repeat step 8. Triggers are not copied.

To review what the automation did: `SYSTEM_LOG` tab, or **Apps Script → Executions**.

## 3. Daily use (sales team)

Work only in the `CRM` tab.

- **Colours.** Lead Priority: red = URGENT, orange = HIGH, yellow = MEDIUM. Lead Status: green = New (not contacted),
  yellow = No Response, purple = Appointment Scheduled. Next Follow-up Date: red = overdue, orange = due today.
- **After every contact attempt**, click the lead's row and use **Lead CRM → Log follow-up for selected lead**.
  The form records the activity in `FOLLOW_UP_LOG`, counts the attempt, sets first/last contact date,
  updates the status and schedules the next follow-up.
- **Quick alternative (also on mobile):** choose a value in **Last Contact Result**. This records one attempt.
- Changing **Lead Status** alone never counts as a contact.
- **Sales Qualification** (HOT / WARM / COLD / DISQUALIFIED) is the salesperson's judgement after a real conversation.
  When filled, it overrides the automatic Lead Quality. The original Lead Score is kept.
- Columns with the note "Automatic column" are filled by the system.

### Contact cadence (defaults, editable in `SETTINGS`)

| Setting | Default | Meaning |
|---|---|---|
| First Response SLA (minutes) | 60 | A New lead not contacted within this time becomes URGENT. Aim to call within 15 minutes. |
| Max Contact Attempts | 6 | Attempts without an answer before closing. |
| Follow-up Intervals (days) | 1;2;2;3;6 | Wait after attempt 1, 2, 3… Attempts fall on day 0, 1, 3, 5, 8 and 14. |
| Auto-close After Max Attempts | YES | After the 6th unanswered attempt the lead becomes **Lost** (reason *No Response*). |
| Retention Months (Lost Leads) | 12 | After this, **Lead CRM → Privacy → Anonymise expired lost leads** erases the personal data. |

Lost leads stay in the CRM (without personal data after anonymisation) so campaign statistics remain correct.

### Priority and quality are separate

- **Lead Quality** = how good the opportunity is (score + salesperson qualification).
- **Lead Priority** = who must be handled first (age of the lead, follow-up deadline, appointment date).

A COLD lead that arrived two hours ago and was never called is URGENT. A HOT lead with a follow-up planned next week is MEDIUM.

## 4. Lead scoring (per client)

Each row of `LEAD_SCORING` is one rule:

| Column | Meaning |
|---|---|
| Active | `YES` / `NO` |
| Criterion | Free label (intent, fit, budget, timeframe…) |
| Source Field | Exact `RAW_LEADS` column name, or the derived fields `Phone Valid` / `Email Valid` |
| Operator | `equals`, `contains`, `is one of` (answers separated by `;`), `not empty` |
| Match Value | Expected answer (not case-sensitive) |
| Points | Points added when the rule matches, or `DISQUALIFY` |
| Explanation | Text shown in the CRM column *Score Explanation* |

Lead Score = sum of the matching rules, limited to 0–100.
`HOT` ≥ *Hot Score Threshold* (70), `WARM` ≥ *Warm Score Threshold* (40), otherwise `COLD`.
A missing answer never matches a rule, so missing information is not penalised.
Do not create rules on sensitive personal characteristics (age, gender, origin, health, etc.).

**The client's "hot lead" question.** Map the form question that marks a lead as hot to the `Hot Lead Answer`
column and list the positive answers in the first default rule (`Yes;Ja;Sim`).
With the defaults: positive answer (60) + valid phone (15) = 75 → HOT.

Rules are applied when a lead enters the CRM. Changing a rule does not rescore existing leads.

## 5. First-install checklist

Run this in a real spreadsheet before the first client:

1. **Lead CRM → Setup → Insert example leads**, then **Sync new leads now**. Three leads appear in `CRM`:
   a Dutch HOT lead with phone `+31612345678`, a Portuguese lead with `+351912345678`, and one with data warnings.
2. Check that the Phone column shows the `+` (text, not a number) and that **Open WhatsApp** is clickable.
3. Paste one row into `RAW_LEADS` without a Lead ID and with an existing email → it gets a `MAN-…` ID and a
   *Possible duplicate* warning. Run the sync twice → no row is duplicated.
4. Log a follow-up with *No Answer* → status *No Response*, attempts 1, next follow-up tomorrow, one line in `FOLLOW_UP_LOG`.
5. Choose a *Last Contact Result* directly in the CRM (desktop and mobile app) → attempts increase.
6. Set a Next Follow-up Date in the past → the cell turns red; after **Refresh priorities and dashboard** the priority rises.
7. Open `DASHBOARD` → figures and three charts.
8. Wait five minutes after adding a raw row → it is synced without any manual action (trigger works).
9. Delete the example rows from `RAW_LEADS`, `CRM` and `FOLLOW_UP_LOG`.

## 6. Connecting Make.com later

The only contract is the `RAW_LEADS` header row: a Make.com scenario
(*Facebook Lead Ads — Watch New Leads* → *Google Sheets — Add a Row*) fills those columns and leaves
`Processing Status`, `Processing Notes` and `Processed At` empty. Nothing else in this system changes.
Keep the ID columns and `Phone` formatted as plain text (the setup does this) so long Meta IDs are not rounded.

## 7. Data protection (GDPR)

- The client is the data controller; the agency is the processor. A data processing agreement should cover this.
- Share each spreadsheet only with the people who work the leads. Never publish it or share by public link.
- `DASHBOARD` contains no personal data and is the only tab suitable for wider sharing (export it, do not share the file).
- Secrets (Telegram bot token, later the Meta access token) are stored in Script Properties, never in cells or code.
- Text typed by leads that starts with `=`, `+`, `-` or `@` is stored as plain text to prevent formula injection.
- Use the anonymisation menu on a regular schedule, and delete a lead on request (data subject rights).
- WhatsApp links only open a chat for a person to write manually. No automated WhatsApp messages are sent.

## 8. Known limits

- The first-response SLA counts calendar time, not business hours.
- A new lead with a date-only `Created Time` is treated as created at midnight.
- More than about ten pipeline statuses would overlap other dashboard blocks.
- Pasting several cells at once into the CRM is picked up by the hourly maintenance, not instantly.

## Development

```bash
node --test lead-crm/tests/*.test.js
```
