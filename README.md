# HW7: account-free attempt logging

This version builds on the supplied HW7 app and preserves all 13 models/items, labeling, no-word-bank Practical Checks, Prove it responses, evidence images, and the single submission PDF. Students enter a name and school email. They never create an account or sign in.

## Session behavior

Progress exists only in the current page's JavaScript memory. There is no browser storage and no student progress-load endpoint. Refreshing, closing, reopening, or switching devices starts over. A restored browser back/forward cache page is reloaded to avoid reopening an old attempt. The app does not read the old build's browser storage. An exit warning helps prevent accidental loss.

Each Begin click creates a server-generated UUID and a random write token kept only in page memory. Repeated visits are separate records even with the same name/email. Tokens restrict a visitor to writing their own attempt; tokens cannot read records. Display names and emails are self-reported, not verified identities.

The open page debounces progress snapshots and queues assessment events. It retries failed writes while it remains open and tries a final keepalive write when hidden/leaving. Closing a page can still lose unsent work. Neither an instructor record nor an export event restores a student session or proves D2L submission.

## What students submit

Exactly one generated PDF, uploaded to **D2L > Assignments > HW7: 3D Practical Prep**, followed by **Submit** and verification of the D2L confirmation. The PDF has 14 pages: one cover and 13 item pages. Full completion is 13/13, including the hyoid. Twelve labeling scenes and twelve Practical Checks earn 24 points; relationship-based original reasoning earns 4 points; the complete submitted PDF earns 2 points. First-attempt accuracy, retries, and clue use are not graded.

Student instructions are in `public/instructions.html` and `public/HW7_3D_Practical_Prep_Handout.pdf`. The student landing and Submission screens also explain the session and submission rules. Replace the course link and due date on the HW7 page in D2L; none was supplied, so this build does not invent them.

## Deploy to Netlify

1. Put the **contents of this hw7 folder** in a Git repository. Connect that repository to your Netlify project. Keep the supplied `netlify.toml`. Publish directory is `public`, Functions directory is `netlify/functions`, and build command is `npm ci && npm run build`.
2. No environment variables are required. The instructor password is machine-generated and was given to the instructor once. The code stores only its SHA-256 hash (`builtInPasswordHash` in `server/core.mjs`). The instructor session-signing secret is generated automatically and stored in the attempt store. Optional variables:
   - `HW7_ADMIN_PASSWORD`: if set (16+ characters), it also works as an instructor password.
   - `HW7_ADMIN_SESSION_SECRET`: if set (32+ characters), it is used instead of the stored secret.
   - `HW7_COURSE_CODE`: a course access code you give students. Leave unset to allow starts without a code. The correct value is checked on the server and is never embedded in browser code.
   - `HW7_STORE_NAME`: defaults to `hw7-attempts-v3`. Give previews/testing a separate name if needed.
   To replace a lost password, generate a long random one, put its SHA-256 hash in `builtInPasswordHash`, and redeploy.
3. Open the deployed site, start a test attempt, answer some items, and confirm the progress status changes to recorded. Complete the test and verify the downloaded PDF.
4. Visit `/admin/`, sign in using the instructor password, and verify that the test attempt appears. Start another visit with the same email and confirm both attempts appear.
5. Publish the activity link, the illustrated instructions, and the due date in D2L. Students need no invitation or Identity account. **Netlify Identity is not used by this build.**

Do not deploy this as a static drag-and-drop folder: the Functions and Blobs dependency need the build pipeline. Browser libraries are copied from pinned npm dependencies into `public/assets` at build time, reducing reliance on third-party script CDNs. A copy of those assets is included for local preview. There are no real passwords or tokens in `public`, the repository, or this ZIP.

## Instructor dashboard

The dashboard groups all attempts by entered email and shows start time, last recorded activity, 13-item completion, which sections were completed and the date/time each was completed (plus when all 13 were finished), current scene, labeling checks, Practical Check rounds, clues, first-round accuracy, and whether PDF generation was logged. Open an attempt for reasoning and the assessment event history. Summary CSV export is available and includes a completion date/time column for every section. Section completion times are recorded by the server the first time each section is finished in an attempt (`complete/<UUID>/<scene>` records); attempts logged before this change fall back to the browser's clock. Class patterns aggregate misses across all attempts, including repeat practice. The PDF in D2L remains the submission to grade.

Instructor login is verified on the server. A signed, Secure, HttpOnly, SameSite=Strict cookie keeps the instructor signed in on that browser for 30 days, or until they sign out. All index reads are protected, including direct endpoint requests. Changing the session secret, or deleting `config/admin-session-secret` from the store, signs out all instructor sessions. The secret password is not stored in browser storage.

`Open authoring tools` checks the same instructor session. Sign in at `/admin/`, then use the link on the landing page or `/#author`. Edits remain preview-only until you export and replace `public/scenes.json`. Anatomical answers remain part of this client-side practice app; browser inspection can reveal them. This is instructional practice, not a secure examination.

## Data and reliability

Netlify Blobs uses `session/<UUID>` headers and immutable `snapshot/<UUID>/<sequence>` records. Snapshot sequencing prevents delayed/retried requests from replacing newer work. Events retain submitted labels, Practical Check answers/results, clue use, reasoning submissions, scene completion, submission-page visits, and PDF generation. Evidence image pixels stay in the page/PDF and are not sent to the log. Instructor summaries read the latest snapshot; details read and deduplicate historical events. Timestamps marked as recorded are server-generated. Client event times are informational.

The public start/save endpoints check origin, content type, body size, scene IDs, count bounds, and per-attempt write tokens. A course code is optional. The attempt-start and instructor-login Functions also use Netlify rate limiting when supported by the deployed runtime. There is no deletion endpoint in the app. Use your Netlify project controls to manage retention. Offline writes are best-effort until the page closes; no background recovery is promised.

## Verification

`npm ci`, `npm run build`, and `npm test`.

Automated server tests use an isolated in-memory store and cover distinct attempts, blocked student reads, write-token protection, immutable retry behavior, delayed writes, input limits, instructor authentication, origin checks, and an optional course code. Local browser verification covers all 13 scene workflows, PDF generation, dashboard indexing, and empty state after refresh. A real deployed Netlify/Blobs round trip still needs the deployment smoke check above.

## Models and attribution

BodyParts3D, copyright The Database Center for Life Science, CC BY-SA 2.1 JP. Derived meshes remain under that license. C1, C2, typical cervical vertebra, and articulated pelvis models were supplied by the instructor. Attribution remains on the landing page.

The supplied BodyParts3D sacrum includes coccygeal segments and is solid inside; the sacral canal appears as its opening rather than a through-tunnel. Existing model coordinates and anatomical content were preserved.

Official Netlify references: [Blobs](https://docs.netlify.com/build/data-and-storage/netlify-blobs/), [Functions configuration](https://docs.netlify.com/build/functions/configuration/), and [rate limiting](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/).
