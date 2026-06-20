# Claude Work prompt — file a BC expense report in Paylocity from the downloaded package

Paste the block below to Claude Work (it drives the browser + reads the unzipped package folder).
Fill in the two placeholders first: the **package folder path** and the **report name**.

---

You are filing a Builders Capital expense report in Paylocity from a downloaded package.

**Inputs**
- Package folder (already unzipped): `<PASTE FOLDER PATH — e.g. ~/Downloads/2026-06 BC Cleveland Trip 6-10-6-14 - Flights>`
- Use this exact text as the Paylocity **Report Title**: `<PASTE THE PACKAGE FOLDER NAME>`

The folder contains:
- one `*.xlsx` — the data, with two sheets: **Report** and **Expenses**
- one `*.pdf` — the BCX report (reference only; do not upload it)
- an `invoices/` subfolder — the receipt PDFs

**Read the Excel first.**
- **Report** sheet — two values: `Report Title` and `Business Purpose`.
- **Expenses** sheet — one row per expense, columns: `Title`, `Transaction Date`, `Payment Method`, `Category`, `Amount`, `Business Purpose`, `Notes`, `Override Cost Center / Job?`, `Itemize?`, `Invoice File`.

**Steps in Paylocity (app.paylocity.com → Expense → Expense Reports):**

1. **Create the report.** New Expense Report. Set **Report Title** to the text I gave above. Set **Business Purpose** to the Report sheet's `Business Purpose`. Leave Event = N/A and Department / Location = default.

2. **For each row in the Expenses sheet, add one expense** (Create New Expense) and fill it EXACTLY from the row:
   - **Title** ← `Title`
   - **Transaction Date** ← `Transaction Date` (MM/DD/YYYY)
   - **Payment Method** ← select the option matching `Payment Method` (it will be "Personal Credit Card (reimbursable)")
   - **Category** ← select the dropdown option whose text equals `Category` (e.g. "Travel : General")
   - **Amount** ← `Amount`
   - **Business Purpose** ← `Business Purpose`
   - **Notes** ← `Notes` (this is the ticket / invoice number)
   - **Override Cost Center / Job?** ← set to **No**
   - **Itemize?** ← set to **No**
   - **Receipt** ← upload the file at the row's `Invoice File` path. This is the receipt's Dropbox path (e.g. `/Finance/CY2026/2026-06 Invoices/2026-06-17 BC Cleveland Delta Air Lines Jessica Davidson 328.20.pdf`), already synced locally under your Dropbox `/Finance` folder. If `Invoice File` is blank, leave the receipt empty and note it.
   - **Save** the expense.

3. Repeat until every Expenses row has a saved expense. The expense count on the report should equal the number of rows.

**Rules**
- Enter values verbatim from the Excel — do not invent, reformat, or "improve" them.
- For any dropdown (Category, Payment Method), pick the option whose visible text matches the cell. If no option matches, STOP and tell me the row + the value; don't guess.
- Match each receipt by the row's `Invoice File` value (it's unique per expense). Don't match by amount/date — co-travelers share those.
- **Do NOT submit the report.** Leave it saved in draft so I can review.
- When done, give me a short table: for each row, the Title, Amount, whether the receipt uploaded, and any field you couldn't set.
