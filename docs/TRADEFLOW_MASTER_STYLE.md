# TradeFlow master visual style

Founder direction: use the supplied turquoise curved T, white TRADE and turquoise FLOW as the logo. The approved new Home screen is the master visual reference for the application.

Canonical mark: public/brand/tradeflow-mark.svg. Reference: docs/master-style/founder-logo-reference.jpg. Headers use a compact responsive mark plus accessible TRADEFLOW text, with FLOW in fixed brand cyan #00dce7. Sidebar, setup and settings use the same mark; map/legacy mark containers receive the same asset. PWA/favicon artwork uses this mark, with 180/192/512 PNG exports. Business names remain visible separately.

Shared neutrals are owned in public/graphite-theme.css: canvas #050505, panel #080b0c, raised input/control surface #0d1214, hover #131c1f, border #23292b, soft border #1b2224, primary text #f5f5f5 and secondary text #a9adb2. Panel radius 16px, card 14px, controls 12px; 20px section spacing. The Home layout remains the reference, not a template that replaces other screens' functional layouts.

public/master-style.css is the final bridge for older fixed-color UI chrome. It applies the shared surfaces to settings, Intelligence, notifications and dialogs and supplies shared brand rules. It deliberately preserves semantic warning/error/success colors, chart data, map imagery, existing accent preferences, focus rings, control targets and screen-reader labels. No business logic, record schemas, permissions or voice contracts change. The existing living orb is retained.

Verification: full Node suite, updated current-palette contrast checks, existing founder Home and adaptive UI journeys, plus scripts/verify-master-style.cjs across 360/390/430/1280px. Screenshots and checks are uploaded by the guarded existing-pilot release workflow. Only explicitly listed branding/master-style public assets may differ from the previous live release; server/config remain unchanged.
