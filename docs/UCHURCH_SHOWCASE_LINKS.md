# uChurch showcase links

2026-10-09: the owner requested the public showcase in every uChurch news post.
This is an explicit uChurch-only addition to the historical single-link rule.

Future publication policy appends `Витрина:` with
https://sunpole.github.io/uChurch-public/ if the main link differs. It never
duplicates the same URL. The footer stays intact within Telegram text limits.

Existing posts are not republished or regenerated. The manual Actions workflow
`Add uChurch showcase links` adds a URL button using `editMessageReplyMarkup`.
It preserves captions, images, post URLs and keys. These legacy posts had no
inline keyboards in the publisher; the operation installs the showcase keyboard.
Only recorded posts from `sunpole/uChurch` and `sunpole/uChurch-public` qualify.

Run with dry_run=true first, review IDs/count, then dry_run=false. Real edits
are blocked locally and use Actions secrets. Each confirmed result is recorded
atomically in published.json; partial successes are committed even on failure.
Repeats skip confirmed messages. A repeated exact keyboard is also accepted as
Telegram's `message is not modified`, covering interruption before checkpoint.
The workflow shares the publication concurrency group. It sends no new posts.

Rollback: revert the policy commit for future publications. Historical buttons
require a separate explicitly reviewed removal operation; reverting source does
not change already-published Telegram messages. No CRM or VPS changes are made.
