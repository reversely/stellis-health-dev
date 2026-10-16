# Contrast workspace experiment

The user supplied [a clipped mobile preview](refs/in-app/inverted.png) and asked for a dark control side beside a light default notepad, with a restrained space feel. They proposed `#594F4F`, `#547980`, `#45ADA8`, `#594F4F`, and `#F9FEF0`. The repeated `#594F4F` is one color, leaving four distinct swatches.

## Reference and decision

**Observed in the supplied image:** A narrow dark Stellis column contains the brand, mode control, conversation title, Record and Import, Vocabulary, navigation, tabs, note tools, and part of a bottom player. The broad white area to its right contains no visible UI. The screenshot does not establish a working desktop split, live recording behavior, or a finished notepad on the right.

**Design inference:** Give the light area a real purpose as the writing and transcript canvas. Keep Record, Import, capture state, waveform, Pause, Stop, and AI Chat in the dark rail. On narrow screens, stack the rail above the canvas so the editor remains full width. Preserve distinct Notes and Live transcript tabs and the live text preview.

The supplied palette is warm and calm, but `#45ADA8` is too pale for small text on `#F9FEF0`. The light interface uses a deeper teal for links and selected tabs, with `#45ADA8` on dark controls. `#547980` supports rail borders and quiet labels. `#594F4F` gives light-canvas metadata a warmer neutral. A deeper blue-green rail extends the palette into a space-like dark core without covering the page in teal. The first experiment paired that rail with `#F9FEF0`; Dark mode made the canvas dark as well. The later night-sky pass below supersedes these colors.

## First browser comparison

[Home at 1440px](refs/contrast-workspace/home-1440.png), [recording at 1440px](refs/contrast-workspace/recording-1440.png), [recording at 390px](refs/contrast-workspace/recording-390.png), , [live home at 390px](refs/contrast-workspace/home-live-390.png), and [dark home at 1440px](refs/contrast-workspace/home-dark-1440.png) were captured from the isolated Stellis server. These show the first iteration with real controls and local fixture data. Compared with the supplied image, the rail holds actions while the right area now holds a usable light notepad. Desktop and 390px checks found no horizontal overflow or page errors. The dark view keeps both surfaces dark while preserving the rail boundary.

This is a layout and color experiment. It does not claim the reference image shows the same interactions.

## Cooler night-sky palette and file tabs

This iteration was superseded by the measured and darker correction below. Its color choices were inferred from the image rather than sampled, which did not meet the user’s direction.

**Feedback, implemented and browser checked 2026-10-16:** The user asked to move the contrast palette away from green, keep a dark core with red undertones and smooth radial color, avoid black, lighten the highlight, and make the primary views look like larger staggered notebook tabs with outward curves around 20px.

**Observed references:** The supplied [gradient image](refs/night-sky-tabs/reference-gradient.png) is a static background with muted mauve at the upper left, blue and teal near the center, and a warm light edge. It does not show an interface state. The supplied [Stellis tab crop](refs/night-sky-tabs/reference-current-tabs.png) shows a green selected Notes pill, a plain Transcript label, and quieter My Notes and Enhanced Notes controls inside the page. The supplied [OneNote image](refs/night-sky-tabs/reference-onenote.png) shows several colored section tabs attached to a horizontal page edge, each with rounded upper corners. Their labels are small and dark on light colors. The image does not show selection or tab switching.

**Stellis decision:** The desktop rail uses a very dark blue-plum base, mauve and blue radial glows, and no black fill. The default canvas shifts to a cool pale blue; Dark mode uses deep indigo on both sides. Primary recording and saved-conversation tabs are 20px-curved file tabs with outward lower corners. All have dark fills and light text; the selected tab lifts 6px and uses a lighter blue. A muted wine tab distinguishes Edited Transcript when available. My Notes and Enhanced Notes remain quieter secondary controls so the page does not gain two competing tab rows.

[Home](refs/night-sky-tabs/home-1440.png), [desktop recording](refs/night-sky-tabs/recording-1440.png), [mobile recording](refs/night-sky-tabs/recording-390.png), [mobile conversation](refs/night-sky-tabs/conversation-390.png), and [dark recording](refs/night-sky-tabs/recording-dark-1440.png) were captured in an isolated browser against fixture data. Primary tabs switched at both widths, and neither width had horizontal page overflow or JavaScript errors. These are Stellis observations, not behavior inferred from the reference images.

## Measured mauve correction and square page

**Feedback, implemented and browser checked 2026-10-16:** The user rejected the inferred blue palette, asked for mauve in place of near-black, then clarified that the sampled colors themselves should all move darker. They also rejected gradients spread across the interface and the rounded document box under the file tabs. The conversation document should have square corners.

**Measured reference:** The supplied [gradient image](refs/night-sky-tabs/reference-gradient.png) is 2880 × 1620 pixels. Direct RGB samples outside the white overlay gave `#64596F` at `(57, 32)` in the mauve corner, `#4F8D99` at `(1439, 32)` in the blue-teal region, and `#CEB195` at `(2821, 809)` on the warm right edge. These are pixel observations. The UI colors below are darker transformations of those picks, not additional sampled pixels.

**Applied color roles:** The single decorative radial gradient is confined to the desktop rail. Its lighter point `#413A48` is about 65% of the sampled mauve RGB channels, and its dark core is `#27222B`; neither is black. The waveform uses `#335C63`, about 65% of the sampled teal. Recording Stop uses `#867361`, about 65% of the sampled warm edge, with light text for contrast. The writing canvas stays flat `#F7F5F6`. Dark mode uses a flat mauve `#2A252F` canvas. Text and focus colors remain lighter where readability requires them.

**Shape correction:** Notes, Transcript, and Edited Transcript retain their file-tab shape, but the saved conversation document beneath them has zero corner radius and no top border gap. The saved player and prominent home rows use small 6px corners. The user’s correction changes the document box rather than assuming every surface should inherit the tab curvature.

[Home](refs/mauve-square/home-1440.png), [square conversation page](refs/mauve-square/conversation-1440.png), [mobile conversation page](refs/mauve-square/conversation-390.png), [recording](refs/mauve-square/recording-1440.png), and [dark recording](refs/mauve-square/recording-dark-1440.png) are isolated browser captures of this pass. The conversation document computed to `border-radius: 0px` at desktop and 390px. Both widths had no horizontal overflow or page errors. The screenshots contain fixture recordings, not user data.

## Balanced sampled palette

**Feedback, implemented and browser checked 2026-10-16:** The user found the darker correction too uniformly mauve. This feedback supersedes the previous assignment of teal solely to the waveform; the earlier measured samples and the request for darker colors, one restrained rail gradient, and a square conversation page still apply.

**Observed reference and inference:** The supplied gradient has a substantial blue-teal region at its center as well as mauve and a warm edge. The previous Stellis screenshots showed mauve across the rail, actions, tabs, and many accents. Making the sampled teal visible in important controls restores the reference's color balance without tinting the writing canvas or adding gradients.

**Applied color roles:** The rail remains dark mauve `#27222B` with one bounded radial highlight `#413A48`. The darker teal derived from the measured `#4F8D99` sample, `#335C63`, now marks Record, Import in the recording workspace, selected file tabs, links, and focus in Light mode. Inactive secondary tabs use an even darker teal `#29444A`; other controls remain mauve. Dark mode uses lighter teal for small text and focus while keeping large teal fills dark. The sampled warm edge supplies the selected-tab hairline `#CEB195` and the darker Stop fill `#867361`. The light page stays flat `#F7F5F6` and the dark page flat `#2A252F`.

[Home](refs/balanced-palette/home-1440.png), [recording](refs/balanced-palette/recording-1440.png), [mobile recording](refs/balanced-palette/recording-390.png), and [dark recording](refs/balanced-palette/recording-dark-1440.png) were captured in an isolated browser. At 1440px and 390px the Live transcript tab selected correctly, neither view overflowed horizontally, and no page errors occurred. These screenshots use fixture recordings and a fake microphone.
