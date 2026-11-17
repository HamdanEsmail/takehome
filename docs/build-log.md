# Build log

What happened while I built Takehome, in order, with the numbers as they came. Written as I went.

## 17 November 2026: the portal, and what it holds

The portal is my university's Blackboard, on my own student account. It lists 17 courses over four terms. Five of them are already locked: their pages say the instructor "will allow access when the course is ready". There is no export button anywhere.

I signed in once, by hand, in a browser that TinyFish opened, and TinyFish kept the session as a Browser Context Profile. I did not use the password vault, because that would store my university password with a third party.

**The first surprise.** TinyFish's browser landed on my Courses page, signed in, but the first request for the portal's own data came back "not found". The page sets a `<base>` that points every relative address at a content network, so `/learn/api/...` went to the wrong host. Naming the portal's origin in full fixed it. I found it by looking at the requests the page itself made and repeating one of them five ways.

**What the portal's own data showed for the 12 open courses:** 522 content items, 124 graded columns, 106 announcements, 9 conversations and 380 documents. Five courses use the newer layout and seven the older one.

**Documents.** Asking the portal for a document from inside the signed-in browser gets a redirect to a link that works for a short time. I fetched a Word file, a PowerPoint file and two PDFs that way, and each arrived whole, with the right first bytes.

## 17 November: the Agent, and a reading I could not use

Two test runs, each on one course's Grades page.

- The newer layout: 3 steps, 6 rows, every score equal to the portal's.
- The older layout: I gave the Agent the wrong address for that layout. The run took 20 steps, finished "completed", and handed back 12 rows. Their titles were the course menu ("Home Page", "Discussions", "Groups", "Tools") and each had a grade. None of it was on any page.

That second run is why every reading is checked. A reading is kept only when its rows are the portal's own rows, and each score is compared at the precision the page shows. The test for this uses the same kind of rows that run returned.

With the right address and a goal that says "copy only what is on the page", the older layout took 3 steps and returned 10 rows, all 10 equal to the portal's. The two tests cost $0.42.

## 17 November: the first export

Everything up to 31 October, so that a rerun could be shown the same day.

- The Agent read the Grades overview in 13 steps: 17 of 17 courses seen, 5 of 5 locked ones recognised.
- Then one run per open course, two at a time. All 12 readings passed the check at the first attempt: 112 rows read, 111 scores equal to the portal's, 1 different and flagged, and 12 rows the portal holds that the Grades page does not show.
- 924 rows came home. 69 Agent steps, $1.10.

**What I got wrong.** The export listed 198 documents. My first count of the portal had found 380. In the older layout, documents are attached to pages, and I had asked for attachments only on file items. I had no check for this; I noticed because the two numbers were far apart.

Fixing it showed a second fault. I had decided which courses the Agent reads again from a fingerprint of everything in the course, so a new set of slides would have sent the Agent, and a charge, to a Grades page where nothing had changed. Now the question is narrower: is the portal's graded work for this course what the export already holds, with every row read? If so the Agent stays away. Content, announcements and documents come from the portal's own data and cost nothing.

The second pass then found 173 more rows, mostly documents, and started no Agent run.

**A key in the wrong place.** My shell still held a TinyFish key for another account from other work, and Node's `--env-file` does not override what the shell already has. The first attempt stopped with "no saved sign-in named Blackboard", which is how I saw it. Nothing was charged. Takehome now reads its own settings file, and the file wins over the shell.

## 17 November: text you can search

TinyFish Fetch reads the short-lived link the portal gives for a document and returns its text. It worked for a PDF and a Word file and refused a PowerPoint file. So PDFs and Word files are turned into text as they are saved, and `search` looks inside them. Fetch is free.
