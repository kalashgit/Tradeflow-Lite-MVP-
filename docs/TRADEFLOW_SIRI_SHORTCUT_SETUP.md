# TradeFlow — Siri-to-Customer Pilot (development only)

TradeFlow's customer parser and database are local-first. The Siri entry point **only opens an editable review**; it does not automatically save, message, invoice, or schedule.

## iPhone setup

In Apple's **Shortcuts** app, create a new shortcut named **Add TradeFlow Customer**:

1. Add **Dictate Text**. Set prompt as desired (for example, "Describe the customer").
2. Add **URL Encode** (or **Encode Text**, using URL encoding) and pass the result of Dictate Text.
3. Add a **Text** action containing:
   `https://tradeflow-v05-preview.bartoszszarafinski.workers.dev/#tf-customer=[Encoded Text]`
   Replace `[Encoded Text]` by inserting the magic variable returned from URL Encode. Do not type the square brackets literally.
4. Add **Open URLs** and pass the Text action result.
5. Run the shortcut manually once, then invoke by saying **"Hey Siri, Add TradeFlow Customer."**

When speaking, start with a person's name followed by labels, e.g. "John Smith, phone 512-555-0198, address 123 Main Street Austin." The dedicated Shortcut supplies the **Add customer** intent. All data must be reviewed before saving.

## Behavior

- The URL **fragment** after `#` is not transmitted to the web server. TradeFlow promptly removes the fragment from its visible URL when it opens.
- The transcript can still appear in shortcut actions, temporary browser state, sync/history, or device logs. Avoid using sensitive client data until the workflow has been validated and your privacy requirements are met.
- Opening a URL might enter Safari rather than an installed Home Screen PWA. IndexedDB data can differ by browser container. Confirm you're in the correct TradeFlow installation before saving.
- The command parser intentionally does not infer dates/phones or automatically create linked records.
- No microphone is permanently active. The in-app microphone is user-initiated; speech recognition support and network requirements vary by browser.
- The current web app **cannot register a custom background wake phrase**. Siri runs this user-installed Shortcut; deeper Siri/App Intents integration needs a native app.
- This feature is experimental on the development preview only and must be tested on an iPhone.

## Test

1. Open TradeFlow preview in the same browser container normally used for customer records.
2. Navigate to Customers, select **Describe customer**, select **Speak a customer command**.
3. Say "Add customer Test Example, phone 512-555-0198", then verify the review. Do not save a real customer as a test.
4. Separately run the Siri Shortcut and confirm it opens the *same review*, without automatic persistence.
5. After consciously approving a test record, retry the same details to verify duplicate warnings.
