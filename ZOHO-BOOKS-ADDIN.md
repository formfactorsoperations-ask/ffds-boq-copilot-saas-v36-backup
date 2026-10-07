# Zoho Books add-in (optional)

Studios that keep their books in Zoho Books can have milestone invoices drafted
there straight from **Money → Raise Invoice**. It is off by default and
per-studio: a studio that never connects it sees no change anywhere.

## What it does

- **Raise Invoice** opens a dialog instead of numbering the invoice locally. It
  links the project's client to a Zoho customer (found or created, remembered on
  the project as `clientBilling.zohoContactId`), settles the place of supply,
  and creates a **draft** invoice in Zoho.
- The milestone is marked `invoiced` with **Zoho's own invoice number** and
  `zohoInvoiceId`, so the app and the books name the same invoice.
- **Drafts only.** Nothing is emailed or marked sent. The studio reviews the
  draft in Zoho and sends it from there. The OAuth grant has no update or delete
  scope, and no code path calls a send endpoint (tests assert both).
- A milestone with nothing officially billable (the cash side) still uses the
  local flow.

## GST

HSN/SAC is per studio (default `998391` for design and execution) and the tax is
picked by place of supply: the studio's GSTIN state (Studio Settings) against the
client's state (GSTIN, Zoho contact, or chosen in the dialog). Same state means
the Zoho `GST<rate>` group (CGST+SGST); any other state means `IGST<rate>`. The
state is never defaulted: when it cannot be determined the dialog asks. The
retainer and any concession come off after GST as one negative adjustment, so
Zoho's total matches the schedule; if they differ by more than ₹1 the dialog says so.

## Invoice numbers

Per studio, in Studio Settings → Zoho Books:

- **Let Zoho number them** (default): uses the series configured in Zoho.
- **Own series**: a template such as `FFDS/{FY}/` gives `FFDS/2026-27/001`. `{FY}`
  is the Indian financial year (1 Apr–31 Mar, read in IST) and the count resets
  each year. The next number is the highest already in Zoho under the prefix plus
  one, so drafts and voids are respected; a race with another user retries once.

## Connecting a studio (Owner or Admin)

Studio Settings → **Zoho Books** walks through it. In short: in Zoho's API
console create a **Self Client**, copy the Client ID and Secret, generate a code
with the scopes shown (10 minutes), and paste all three in. The server swaps the
code for a refresh token. No Zoho app has to be built or published.

## Where things live

| What | Where |
|---|---|
| Rules (GST split, numbering, draft payload) | `lib/zohoBooks.ts` |
| Zoho client and the raise flow | `functions/src/zohoBooksApi.ts` |
| Callable `zohoBooks` (status, connect, settings, contacts, pushInvoice) | `functions/src/zohoBooks.ts` |
| Credentials | Firestore `zohoBooksConnections/{tenantId}`, server-only |
| Milestone ↔ draft ledger (idempotency) | Firestore `zohoInvoiceLinks/{tenant}__{project}__{milestone}`, server-only |
| Settings card / raise dialog | `components/studio/ZohoBooksCard.tsx`, `components/ZohoRaiseInvoiceDialog.tsx` |

Raising twice for the same milestone returns the existing draft rather than
creating a second. If it was sent or paid in Zoho the app refuses and says so.

## Deploy

```
firebase deploy --only functions:zohoBooks,firestore:rules
```

No new secrets: each studio's credentials are stored per studio, not as Firebase
secrets.

## Known limits

- One-way: the app does not yet learn that a draft was sent or paid in Zoho.
  "Mark Paid" stays manual.
- Reverting an invoice here does not delete the Zoho draft (the grant cannot);
  the dialog says so, and raising again hands back the same draft.
- Credentials are stored in a server-only Firestore document, protected by the
  rules and Google's encryption at rest, not additionally encrypted by the app.
