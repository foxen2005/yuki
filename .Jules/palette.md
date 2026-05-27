## 2025-05-27 - [Accessibility: Keyboard Navigation & ARIA Labels]
**Learning:** In Electron apps using custom HTML/CSS frameworks, interactive elements like custom catalog items (divs) and icon-only buttons often lack proper accessibility attributes and keyboard listeners. Screen readers and keyboard-only users are locked out if these are not explicitly handled.
**Action:** Always ensure that 'div' buttons have `role="button"`, `tabindex="0"`, and corresponding `keydown` listeners for Enter/Space. Icon-only buttons MUST have `aria-label` even if they have a `title`.
