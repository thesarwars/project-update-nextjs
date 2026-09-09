# Standup

A local tool for collecting the team's daily update person by person and copying the whole
thing out in one click, already formatted.

```bash
npm run dev      # http://localhost:3000
```

The first visit takes you to **/setup** to create the administrator account. Everyone else
joins by invitation — there is no public sign-up. Everything lives in `data/standup.db`.

## The team

- **Accounts.** Sessions are cookie-based and stored in the database, so signing someone out
  actually revokes them. Passwords are hashed with scrypt. There is no signing secret to
  manage: the only secret is the database file.
- **Invitations.** On the People screen, the ↗ button next to someone creates a one-time link
  and copies it to your clipboard — no mail server, you send it however you already talk to
  them. It expires in seven days, and re-inviting replaces the previous link.
- **Claiming a place.** An invitation is issued against a *roster row*, so when someone
  claims it they immediately own every standup entry that row has ever written. Nothing is
  migrated or re-keyed.
- **Roles.** `admin` manages projects, people and invitations. `member` does everything else.
  A member sees only the projects whose roster they are on.
- **Any member can edit any entry** in their project, deliberately — the standup is often
  filled in by one person reading out the team's updates.
- **No password reset.** It would need a mail server; an administrator issues a fresh
  invitation link instead.

Removing someone from the roster never deletes what they wrote: a person with entries is
deactivated — kept, but left out of the update — and only a row that has never written
anything is actually deleted.

## Typing

Each person has four fields — **Done**, **ToDo**, **Dependency**, **Remarks** — and each one is
a bullet list. A field you leave empty is left out of the update entirely, so the two you don't
use every day cost you nothing.

| Key | What it does |
| --- | --- |
| `Enter` | finish this point, start the next one |
| `Shift`+`Enter` | another line inside the **same** point |
| `Tab` / `Shift`+`Tab` | nest this point under the one above, or pull it back out |
| `Backspace` over the `- ` | turn the line into a **sub-header** |
| `Enter` on an empty point | step out a level, then leave the list |
| `Escape` | leave the field (so `Tab` can move on) |
| `⌘`/`Ctrl`+`Shift`+`C` | copy the whole update |
| `⌘`/`Ctrl`+`S` | force a save (it already autosaves) |

The sidebar holds **Standup**, **People** and **Settings**; the bar above it switches project
and signs you out.

So a field can hold more than a flat list:

```
Role Review:
- attend team meeting
  - beauty section
  - salon section
- make the documents also
```

`Role Review:` is a line with no `- ` in front of it, which makes it a bold sub-header rather
than a point. The two indented lines are sub-points of the one above them. Pasting a list from
somewhere else strips whatever bullets it came with, keeps its indentation, and re-bullets it.

Sub-points survive the trip into **Discord**, **Slack**, **Google Docs**, **Notion** and email as
real nested lists. **WhatsApp** has no nested lists at all, so there they come through indented
and marked with `◦` instead.

## Copying

**Copy update** puts the update on the clipboard twice over — as rich text *and* as markdown —
so the app you paste into picks whichever it understands:

- **Slack, Google Docs, Notion, email** read the rich text and format it on paste.
- **Discord** reads the markdown and renders the bold text and bullets itself.

That is the `Rich text` setting, and it is the default. The dropdown next to the button also
offers `Markdown`, `WhatsApp` (`*single asterisks*`) and `Plain` if a particular place mangles
the rich version. Each person's card has its own copy button for posting one update on its own.

Output looks like this:

> **Daily Standup Update – Go Style**
> **Date: 08-Sep-2026**
>
> **Nihal:**
> **Done:**
> - Feedback all done
>
> **ToDo:**
> - Create a shareable page/form to review build steps…
>
> **Dependency:**
> - Waiting on Imran's API

## Around the app

- **Project** — one per team. Its heading, its four section labels, its own people. Rename the
  labels to whatever your team says — `Yesterday` / `Today` / `Blockers` / `Notes` works just as
  well. The heading takes `{project}` and `{date}` placeholders.
- **Date** — arrows, a date picker, and `Today`. The URL carries `?project=…&date=…`, so any day
  is bookmarkable.
- **People** — add, rename, reorder, remove. The order here is the order in the update.
  Unticking someone keeps their history but leaves them out.
- **Previous day** — a panel down the left showing what everyone said they would do on the last
  day with content, so you can write today's Done against it without flipping back and forth.
  Each name has a button to pull that person's ToDo into today. Toggle the panel from the
  header; the choice sticks.
- **Carry over** — fills empty ToDo fields from the last day that had anything, so yesterday's
  plan starts today's. It never overwrites something you have already written.
- **Heading / Hide empty** — toggles above the preview. `Hide empty` (on by default) drops empty
  sections and anyone with nothing to report; turn it off to print every section with a `-`.

Edits save themselves about half a second after you stop typing; the header says when.

## Data

Everything lives in `data/standup.db`, an ordinary SQLite file — copy it to back up, delete it
to start over (the app recreates it with a sample project). Point `STANDUP_DB_FILE` somewhere
else if you would rather it lived elsewhere.

SQLite comes from Node itself (`node:sqlite`), so there is nothing to compile — but that needs
**Node 22.5 or newer**. Node prints one `ExperimentalWarning` about it at startup; it is harmless.

Back it up with `node scripts/backup.mjs`, which snapshots through `VACUUM INTO` and verifies
the copy before reporting success. That is safer than `cp`, which can catch a live database
mid-write. Restore by stopping the app, moving the current file aside, and putting the backup
in its place.

`STANDUP_JOURNAL_MODE=WAL` is worth setting when the app is deployed for several people, so
readers do not queue behind a writer. It stays `DELETE` by default, which keeps the database
one self-contained file.

## Layout

```
app/(app)/…      the signed-in app: standup, people, settings
app/(auth)/…     login, first-run setup, invitation claim
app/api/…        REST endpoints (projects, entries, carry-over, invites, settings)
lib/db.ts        SQLite schema, migrations and every query
lib/auth.ts      sessions and guards; lib/password.ts is the pure crypto
lib/format.ts    editor text -> items -> markdown / rich HTML
lib/clipboard.ts the two-format clipboard write
components/shell the app frame both features live in
components/      the UI; BulletEditor.tsx is the list-aware textarea
```
