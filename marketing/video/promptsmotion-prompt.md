You are the senior motion designer, product designer and HyperFrames (HTML + GSAP) engineer for Savora.

Your task is to create a premium, Apple-level product film for Savora — a multi-tenant SaaS for Uzbek retail shops (phones, home appliances, furniture): sales/kassa, inventory, nasiya (installment debt), multi-branch reports and an AI assistant.

This is NOT a generic SaaS explainer.
This is NOT a five-feature walkthrough.
This is NOT a startup template animation.

Desired reaction from a shop owner in Tashkent:
"Bu bizning do'kon uchun qilinganmi? Juda qimmat ko'rinadi."

────────────────────────────────────
REPO / SOURCE OF TRUTH
────────────────────────────────────

Inspect the real repository before designing anything:

  Product (Next.js 15):        web/
  Brand mark (use as-is):      web/app/icon.svg, web/components/BrandMark.tsx
  Design tokens / primitives:  web/app/globals.css, web/components/ui/ux.css
  App screens:                 web/app/app/*  (kassa, nasiya, sales, customers, branches, ai, monitoring)
  Real UI screenshots:         marketing/video/savora-reels/assets/shots/
  Fonts (OFL):                 marketing/video/savora-reels/assets/fonts/

There is already a 30 s vertical Reels composition in marketing/video/savora-reels
(script: marketing/video/ssenariy.md).

DO NOT replace or regress it. Create a NEW independent composition, e.g.
  marketing/video/savora-showreel-15/
Reuse fonts, screenshots, logo and easing helpers where useful — but creatively this is a new film.

Do not invent functionality that does not exist. Grep the code before claiming a feature.
Explicitly FORBIDDEN claims (not implemented):
  • contract / PDF / SMS-code signing
  • automatic SMS reminders to customers
  • customer counts, revenue numbers or any unverifiable statistic
Allowed (verified): fast sale at kassa, cash / debt / nasiya / bank credit payment,
nasiya schedule + reminders to the owner, customer payment history, multi-branch reports,
AI assistant that analyzes and creates tasks, "14 kun bepul", savora.uz.

────────────────────────────────────
VISUAL LANGUAGE — "SAMARQAND"
────────────────────────────────────

Background deep ink:   #0D1526
Light surface:         #F2F4F9
Primary cobalt:        #1F4FA8
Cobalt highlight:      #3A68C4
Gold accent:           #E0A526 / #D69A17  — ONLY for money, nasiya, and the logo line

Typography:
  Unbounded — headlines
  Onest — body / UI
  Tabular numbers for so'm amounts (e.g. "2 916 666 so'm")

Use the real Savora logo: cobalt square, three rising bars, gold underline. Never redraw it.

Gold is precious, not a yellow flood. Think Samarkand tilework: cobalt glaze, gold leaf,
geometric precision, quiet confidence — subtle girih-pattern geometry is allowed as texture, never as decoration noise.

UI style is iOS-flat: flat buttons, grouped lists, frosted panels.
NO 3D/beveled buttons. 3D depth only on hero cards, KPIs and charts.

NOT: cyberpunk, crypto, neon, generic AI purple, rainbow gradients, bouncing UI.

────────────────────────────────────
CORE CREATIVE RULES
────────────────────────────────────

1. ONE SHOT = ONE IDEA. Every scene breathes.
2. The real product UI is the hero.
3. Object-driven transitions, no hard cuts without reason:
   a paper debt notebook page becomes a nasiya schedule row,
   a so'm amount becomes a KPI card,
   a sale receipt becomes a customer history line,
   one branch card multiplies into the branches overview.
4. Premium easing (power3/power4, expo). No linear motion.
5. Overlapping motion — elements never all start/stop on the same frame.
6. Depth used sparingly: perspective, soft parallax, scale, foreground/background separation.
7. No particle spam, no fake glassmorphism everywhere, no pointless spinning cards,
   no constant zooming, max 3–4 motion styles total.
8. Kinetic typography for the few words on screen — short, Uzbek Latin, no paragraphs.

────────────────────────────────────
FORMAT
────────────────────────────────────

Master: 1920 × 1080, 60 fps, 16:9, H.264, 14–15 s.
Must work with sound OFF (Telegram / Instagram autoplay).
After the master: a recomposed 1080 × 1920 vertical variant (re-layout, not a crop).
All on-screen text in Uzbek (Latin script).

────────────────────────────────────
STORY / EMOTIONAL ARC
────────────────────────────────────

QOG'OZ → TARTIB → ANIQLIK → SAVORA
(paper chaos → control → clarity → brand)

First 1.5 s must already look premium. First real product moment by ~2 s. No long logo intro.
Line to SHOW, not explain: "Do'koningiz — bitta tizimda."

────────────────────────────────────
SUGGESTED STORYBOARD (starting point, not rigid)
────────────────────────────────────

0.0–1.5   Ink background. A worn paper nasiya notebook page, handwritten debts.
          A single gold glint traces one amount.
1.5–4.5   The handwritten line lifts off the paper and becomes a clean nasiya
          schedule row (6 monthly segments filling). Real screen: app_nasiya.png.
          Text: "Nasiya — tartibda."
4.5–7.5   Camera glides into the kassa screen; a sale is confirmed
          ("Sotuv tasdiqlandi"), receipt folds into the customer's payment history.
          Text: "Sotuv — 2 daqiqada."
7.5–10.5  The customer card shrinks into one of several branch cards; they arrange
          into the multi-branch report (desk_monitoring_c.png). An AI panel types one
          short insight and creates a task.
          Text: "Barcha filiallar. Bitta ekran."
10.5–15.0 Everything resolves into the Savora mark: three bars rise, gold line draws.
          "Savora" · "Do'koningiz uchun yagona tizim" · "savora.uz — 14 kun bepul".
          Hold last frame ≥1.2 s.

────────────────────────────────────
SOUND
────────────────────────────────────

Minimal, warm electronic bed (~110–120 BPM), cuts on beat boundaries.
Soft paper rustle at open, subtle whooshes only on object transitions, one low impact on logo.
Use only original/procedural or properly licensed audio.

────────────────────────────────────
QA BEFORE DELIVERY
────────────────────────────────────

• Lint/check the composition, render, then watch the full MP4 frame by frame at key moments.
• Verify every claim against the code; list the evidence in a short README.
• Check text safe areas, legibility at phone size, no clipped Uzbek characters (o', g', sh).
• Deliver: master MP4, vertical MP4, cover PNG, and a short scene/timing table.
