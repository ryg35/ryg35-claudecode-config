# UI change screenshots (MANDATORY, every project)

After any change that alters what a user sees on screen (labels, layout, styles, new or removed elements), show the user screenshots of the running preview in the chat before asking for push or merge. No exceptions, including one-word label changes.

1. Run the changed build locally (dev server, preview, simulator). The screenshot is of the real running app, never a mockup.
2. Mark every changed element this way (reference image: `~/.claude/scripts/ui-shot-example-f1weather.png`): a thick yellow rounded outline around the element (no fill), plus a numbered yellow callout box outside the screenshot, on the gray margin, joined to the outline by a straight yellow line. The callout says what changed or what it does, in the user's language, e.g. 「1. 親指が届く位置。コピー・X・LINE を常に表示」. Not red, no arrows, no fill over the content.
3. Look at every image yourself before sending (Read it). Overlapping callouts or a box on the wrong element means fix and re-shoot.
4. Save the PNGs and send them to the chat as files the user can see (in Claude Desktop: `SendUserFile` with `display: "render"`). A screenshot only taken with a browser tool is invisible to the user and does not count.
5. Under the images, list each change as before → after, one line each. Name any change the highlight missed.
6. Cover every surface the change touches (list, detail pane, modal, mobile width if layout changed). One image per surface.

Web pages: `node ~/.claude/scripts/ui-shot.mjs --url <url> --out <png> --mark 'text:<regex>::<note>' --mark 'css:<selector>::<note>' [--click <css>] [--auth user:pass] [--wait <regex>] [--width 1400 --height 900]`. Run it from the project directory so it picks up that project's `playwright`, or set `PLAYWRIGHT_PATH` to playwright's `index.mjs`. One `--mark` per change; its number is its order. Every element the matcher hits gets an outline, the callout joins the first hit. It exits 2 when any mark found nothing; fix the matcher rather than sending an image with a missing mark.
Test credentials for local previews come from the project config (e.g. `.claude/launch.json`), never from production.

Stop the preview server afterwards and report the live-process count (see `agents.md`).

Why: a text summary of a UI change ("renamed the label, moved the button") cannot be checked at a glance, and the user ends up opening the app to see it. A marked screenshot in the chat lets them approve or reject the change without leaving the conversation.
