# TradeFlow Graphite — Locked Design Baseline
Approved 2026-10-18. Status: binding visual specification for new work and incremental existing-screen harmonization.

## Primary design reference
User-approved ChatGPT-inspired TradeFlow Graphite concept screenshot shared in the design conversation. Do not assume the screenshot is an exported pixel-accurate implementation. Its decisions are binding: nested neutral graphite surfaces, low-contrast grey border separation, softly rounded cards, crisp typography, restrained cyan icon accents, aligned layout and spacious-but-efficient content organization.

## Color tokens
Use `public/graphite-theme.css` as the implementation source of truth:
- canvas `#111214` (selected over slightly lighter `#1B1C1F`)
- outer panel `#1C1D20`
- inner/raised cards `#292B2F`
- subtle border `#373A3F`
- foreground `#F5F5F5`
- muted foreground `#A9ADB2`
- restrained graphical accent `#65D3E1`
Maintain legacy, user-selectable accent if applicable; semantic red/green/amber statuses remain semantically meaningful. Never color map tiles to match ordinary UI panels.

## Shape and typography
- outer panels ~22px radius; inner cards ~18px; controls ~12px
- avoid glowing cyan outlines on ordinary cards
- consistent outlined icon family and optical sizes; selected icon/action can use accent
- Inter/system sans hierarchy; white prominent numbers/titles, grey supporting descriptions
- baseline outer panel padding ~20px; inner card padding ~16px; card gap ~12px; adjust responsively without overflow
- no redundant decorative UI, gradients or invented dashboard values

## Layout rules
- Preserve locked universal header: stationary T + TRADEFLOW, contextual intelligence summary/actions, bell.
- Preserve mobile bar Home | Map | Calendar | Finance | More.
- Preserve existing workflows and information density. Do not force calendar grids, forms or maps into decorative cards.
- Equal-height consistent metrics where relevant, responsive on narrow phones.
- Map controls must not overlap search, zoom or system safe areas.
- Do not add another AI orb or Business Missions/Explore Capabilities page.

## New intelligence interfaces
Universal Command, TradeFlow Library and Headquarters War Room inherit these tokens and spacing rules. They must serve the owner-operator with low-friction, understandable interactions; no fake autonomous features or fabricated business data.

## Change safety
Incremental visual changes only; no IndexedDB migrations, functional rewrites or production deployment as part of theme work. Test actual iPhone safe areas, legibility, interactive controls and data-preserving workflows. Protected production worker `calm-rice-1ea7` must not be modified.
