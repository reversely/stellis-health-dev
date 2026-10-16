# Contrast workspace experiment

The user supplied [a clipped mobile preview](refs/in-app/inverted.png) and asked for a dark control side beside a light default notepad, with a restrained space feel. They proposed `#594F4F`, `#547980`, `#45ADA8`, `#594F4F`, and `#F9FEF0`. The repeated `#594F4F` is one color, leaving four distinct swatches.

## Reference and decision

**Observed in the supplied image:** A narrow dark Stellis column contains the brand, mode control, conversation title, Record and Import, Vocabulary, navigation, tabs, note tools, and part of a bottom player. The broad white area to its right contains no visible UI. The screenshot does not establish a working desktop split, live recording behavior, or a finished notepad on the right.

**Design inference:** Give the light area a real purpose as the writing and transcript canvas. Keep Record, Import, capture state, waveform, Pause, Stop, and AI Chat in the dark rail. On narrow screens, stack the rail above the canvas so the editor remains full width. Preserve distinct Notes and Live transcript tabs and the live text preview.

The supplied palette is warm and calm, but `#45ADA8` is too pale for small text on `#F9FEF0`. The light interface uses a deeper teal for links and selected tabs, with `#45ADA8` on dark controls. `#547980` supports rail borders and quiet labels. `#594F4F` gives light-canvas metadata a warmer neutral. A deeper blue-green rail extends the palette into a space-like dark core without covering the page in teal. The default theme pairs that rail with `#F9FEF0`; Dark mode makes the canvas dark as well.

## Browser comparison

[Home at 1440px](refs/contrast-workspace/home-1440.png), [recording at 1440px](refs/contrast-workspace/recording-1440.png), [recording at 390px](refs/contrast-workspace/recording-390.png), , [live home at 390px](refs/contrast-workspace/home-live-390.png), and [dark home at 1440px](refs/contrast-workspace/home-dark-1440.png) were captured from the isolated Stellis server. These show real controls and local fixture data. Compared with the supplied image, the rail holds actions while the right area now holds a usable light notepad. Desktop and 390px checks found no horizontal overflow or page errors. The dark view keeps both surfaces dark while preserving the rail boundary.

This is a layout and color experiment. It does not claim the reference image shows the same interactions.
