# Takehome

**Empty your locker before it locks.**

Site: https://takehome.hamdanesmail12-7a9.workers.dev · [The sample locker](https://takehome.hamdanesmail12-7a9.workers.dev/sample/) · [How it works](https://takehome.hamdanesmail12-7a9.workers.dev/how/)

My university runs its coursework on Blackboard. There is no export button, and the portal has already locked 5 of my 17 courses: their pages say the instructor "will allow access when the course is ready". Takehome works from a sign-in I make once by hand inside TinyFish. It has the TinyFish Agent read my Grades pages, checks every reading against what the portal itself reports, and writes everything to one JSON file, six CSV files and a folder of documents. Run it again and it takes only what is new.

```bash
node src/cli.ts export --until 2026-10-31   # a first export, up to a day
node src/cli.ts export                      # later: only what is new
node src/cli.ts search standard deviation   # look inside the documents
node src/cli.ts status                      # counts, checks and what was spent
node src/cli.ts site                        # build the public site from the sealed list
```

## The portal, and how the Agent signs in

- **The portal** is UAEU's Blackboard Learn, on my own student account. Five of my courses use its newer layout and seven the older one.
- **The sign-in** is a TinyFish Browser Context Profile. TinyFish opens a browser, I sign in to Blackboard in it myself, and TinyFish keeps the session. Every Agent run uses that profile (`use_profile`, `profile_id`).
- **No password** is in this code, in the settings file or in any Agent goal. I do not use the vault: it would store my university password with a third party.
- **When the session ends**, Takehome sees the sign-in page, stops, and asks me to sign in again. It never exports a sign-in page.

## How TinyFish is used

| TinyFish | Where in the code | What it does here |
|---|---|---|
| **Agent** `POST /v1/automation/run-async` | `src/run/agent.ts`, `src/run/export.ts` | One run reads the Grades overview: every course, and which are locked. Then one run per course reads its Grades page, on the saved sign-in, against a fixed answer shape. Every goal is read-only and says so. |
| **Runs** `GET /v1/runs/{id}` | `src/tinyfish/api.ts` | Follows each run to its end and records its steps and its cost in a ledger, before the next run starts. |
| **Fetch** `POST api.fetch.tinyfish.ai` | `src/tinyfish/api.ts`, `src/run/export.ts` | Turns each PDF and Word file into text, from the short-lived link the portal gives for it, so the export can be searched. |
| **Browser Context Profile** `/v1/profiles`, `/setup-session`, `/save` | `src/portal/browser.ts` | Holds the sign-in. Its browser, driven over the Chrome DevTools Protocol, reads what the portal itself reports and asks where each document is. Each use is saved back, so the next run still lands signed in. |

The Agent reads what a student sees. The profile's browser reads the data the portal's own pages load for themselves. Having both is what lets every reading be checked.

## What comes home

```
takehome-data/
  export.json          everything in one file: courses, items, grades, files, announcements, messages, runs
  csv/                 one CSV per table, the same columns on every line
  files/<course>/      the documents themselves
  text/<course>/       PDFs and Word files as text
  changes/run-3.json   what each run added or changed
  manifest.json        counts and checks per course, every run, every dollar
  sealed.json          the only file that is ever published
```

- **Ids:** every row keeps the portal's own id. A rerun merges by id, so a row is never taken twice, and a changed score updates its row.
- **Grades:** each grade row says how it was checked. `match` means the Agent read it and it equals the portal's. `differs` means the page shows another score. `not on page` means the portal holds the row but the Grades page does not show it to me. `unread` means no reading has been accepted yet.
- **Documents:** each has its size and SHA-256. A document left out has its reason in `manifest.json`.
- **Nothing is dropped.** A row the portal stops showing stays in the export, because the portal locks old courses.

## Results on my account

TBD_RESULTS

## Checked, not trusted

An Agent run can finish "completed" and still hand back rows that are on no page. One of my first tests did exactly that: I gave it the wrong address for a course's Grades page, and it returned 12 rows named after the course menu, each with a grade.

So a reading is accepted only when at least 60% of its rows are the portal's own rows, matched by title. Each matched score is then compared at the precision the page shows, so the portal's 82.4567 equals the page's "82.46". A reading that fails is read once more. If it fails again its rows stay `unread`, and nothing is filled in. The rule is in `src/core/match.ts` and its tests use rows like the ones that run returned.

## Reruns take only what is new

- **Content, announcements and documents** come from the portal's own data on every run. That costs nothing, and the merge adds only rows whose id is new.
- **The Agent** is sent only to courses whose graded work is not what the export already holds. New slides in a course do not send the Agent to its Grades page.
- **Documents** already saved are not fetched again.
- **A first export can stop at a day** (`--until`), and the next run takes what came after.

## Long histories, lists that load in parts, and failures

- **Four terms, two layouts.** Each layout keeps its Grades page at a different address; both are handled.
- **Lists that come in pages** are followed to the end, and folders are walked level by level.
- **One Agent run per course**, at most 8 steps and 4 minutes, two at a time. A failed run loses one course, not the export.
- **Every file is written whole or not at all**, and the ledger is saved after every run, so a crash leaves a state the next run can continue from.
- **The browser on the saved sign-in is reopened** every ten minutes during long downloads, and an Agent run that is still using the sign-in is waited for.
- **A spending cap** stops the work before a run whose worst case would pass it.

## Safety and privacy

- **Only my own account, and only reading.** Every Agent goal forbids Submit, Start, Begin, Send, Save, Delete and Mark, and forbids opening an item. The browser only ever sends GET requests.
- **No test is opened.** Only the Grades page is read, so nothing can start an attempt.
- **Other people are left out.** A conversation is kept as its date and its number of messages: no sender, no recipient, no text.
- **Pace.** One or two pages at a time, never a burst. Blackboard's terms allow automated access that sends no more requests than a person could.
- **What is published.** One file, `sealed.json`, built from an allow-list: counts, sizes, months and fingerprints made with a secret salt. It holds no title, name, code, id, date or score. The bars on each locker door take their length from the fingerprint, because a real length could give a course away. A test builds the sealed list and the site from an export and fails if any word of that export appears in them.
- **What stays here.** The export, the documents and the settings file are outside this repository.
- **TinyFish's run pages** hold real pictures of my portal, so their links go to the judges only.

## What it does not do

TBD_LIMITS

## Run it on your own Blackboard

You need Node 24 and a TinyFish account.

1. On TinyFish, open Browser Context Profiles, create a profile named `Blackboard`, choose "Set up sign-ins", sign in to your school's Blackboard in the browser it opens, and save.
2. Copy `.env.example` to `../.takehome.env` (outside this folder) and fill in your TinyFish key, your school's Blackboard address and a long random salt. That file wins over anything in your shell.
3. `npm install`, then `node src/cli.ts export`.

The export is written to `../takehome-data`. To see it, open [the sample locker](https://takehome.hamdanesmail12-7a9.workers.dev/sample/) and choose your `export.json`: it is read in your browser and goes nowhere.

## Tests

`npm run check` runs the type check, the tests and a dry run of the deploy. The tests never touch the network: every portal answer and every Agent answer in them is made up. TBD_TESTS

## More

- [The build log](docs/build-log.md): what happened as I built it, faults included.
- Built by [Hamdan Esmail](https://github.com/HamdanEsmail) for the TinyFish Student Bounty, Drop 002.
