# Help Page — Reference

**Route**: `/help`  
**File**: `apps/web/src/pages/help/HelpPage.tsx`

---

## Layout (in order)

1. Page header — "Help & Support" + subtitle
2. Tutorial section — "New to Legacy Sports?"
3. Quick Links section (5 chips)
4. Frequently Asked Questions (accordion)
5. Historical Stats — How It Works (accordion)
6. Contact & Support section
7. Footer

---

## Tutorial Section

- Header: "New to Legacy Sports?"
- Description of the 6-step interactive walkthrough
- "Launch Tutorial" button → opens `OnboardingTutorial` modal
- Estimated time: "Runs in under 2 minutes."

---

## Quick Links (5 chips)

| Label            | Route                     |
| ---------------- | ------------------------- |
| My Leagues       | `/baseball`               |
| Players          | `/players`                |
| Player Stats     | `/players/stats`          |
| Create League    | `/baseball/league/create` |
| Profile Settings | `/profile/settings`       |

---

## FAQ Sections (2 accordion groups)

### Frequently Asked Questions

Source: `HELP_FAQ_ITEMS` from `@legacy-sports/utils/help-content`

Each item: collapsible question → answer text on press

### Historical Stats — How It Works

Source: `HELP_HISTORICAL_FAQ_ITEMS`

Same collapsible format.

---

## Contact & Support Section

4 contact option cards (from `HELP_CONTACT_ITEMS`):

| Type                | Icon          | Action                                                        |
| ------------------- | ------------- | ------------------------------------------------------------- |
| Bug/Feature Request | Bug icon      | Opens bug report dialog (if `env.jiraProxyUrl` exists) or URL |
| Idea/Suggestion     | Lightbulb     | Opens URL in new tab                                          |
| Feedback            | MessageCircle | Opens URL in new tab                                          |
| Other               | Gamepad       | Opens URL in new tab                                          |

**Urgent support note**: "For account access problems or missed draft notifications, join our Discord server and post in #urgent-support — we respond much faster there." (Discord link opens new tab)

---

## Footer

- "© {year} Legacy Sports · Fantasy Baseball Management"
- "Powered by official MLB statistics • Data refreshed throughout each game day"

---

## GraphQL

None. All content is static/hardcoded.

---

## States

| State           | Display                                                 |
| --------------- | ------------------------------------------------------- |
| Tutorial closed | Default                                                 |
| Tutorial open   | `OnboardingTutorial` modal                              |
| Bug report open | Bug report dialog (controlled by `bugReportOpen` state) |
| FAQ item open   | `openFaq === i` — answer section revealed               |
| FAQ item closed | Answer hidden, chevron points down                      |
