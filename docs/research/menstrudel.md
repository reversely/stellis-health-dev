# Menstrudel interface review

Stellis uses Menstrudel's daily status, calendar and pill pack interactions for cycle and contraception tracking. The initial implementation exposed three columns of forms and text. User feedback rejected that interface and explicitly requested a review of the source screenshots as well as its code.

## Evidence inspected

Reference revision: `09e31748776da7412e6c1b6be74dd70dd83b9536` in [J-shw/Menstrudel](https://github.com/J-shw/Menstrudel). The following images were opened and visually inspected at their original aspect ratio. Their filenames place them under `docs/screenshots/android` even though several images include an iPhone frame.

| Screenshot | Visible interface | Stellis application |
| --- | --- | --- |
| [Today](https://github.com/J-shw/Menstrudel/blob/09e31748776da7412e6c1b6be74dd70dd83b9536/docs/screenshots/android/logs_today_screen.png) | Today, Logs and Insights tabs sit above a large progress ring. A short next-period row and a separate phase row sit below it. The Add action remains separate from the status | Show daily cycle status before history. Present a named day figure with its recorded start date beside the calendar. Keep logging separate from saved status |
| [Calendar](https://github.com/J-shw/Menstrudel/blob/09e31748776da7412e6c1b6be74dd70dd83b9536/docs/screenshots/android/logs_calendar_screen.png) | Seven weekday columns align the dates. Different flow intensities use different fills. Today has an outline. Future dates are subdued and predicted period days use a separate treatment | Render real calendar dates with logged flow and an independent Today outline. Date selection opens the matching entry. Month navigation retains the same weekday structure |
| [Logging sheet](https://github.com/J-shw/Menstrudel/blob/09e31748776da7412e6c1b6be74dd70dd83b9536/docs/screenshots/android/logs_add_log_screen.png) | A bottom sheet keeps the parent screen visible. A large date selector precedes visible flow choices, pain controls and symptom chips. Cancel and Save sit together at the bottom | Use a focused native dialog with visible flow choices and date fields. Keep symptoms and notes optional. Preserve the draft after errors. Keep Save and Cancel together |
| [Pills](https://github.com/J-shw/Menstrudel/blob/09e31748776da7412e6c1b6be74dd70dd83b9536/docs/screenshots/android/pill_screen.png) | A large current-pill number sits inside a progress ring. Skip and Mark as Taken precede a seven-column pack. Taken days use checks. A skipped day has a distinct symbol. The selected day has an outline. Break pills differ from active pills | Pair current pack progress with the actual seven-column pack. Let people select past dates. Show Taken, Skipped, active and break states with labels and shape differences. Give the selected date a daily action and undo |
| [Contraceptives](https://github.com/J-shw/Menstrudel/blob/09e31748776da7412e6c1b6be74dd70dd83b9536/docs/screenshots/android/contraceptives_screen.png) | Active records and History have separate headings. Each tappable record groups type, logged date and next due date. The due date has greater contrast than the logged date | Separate active devices from removed-device history. Place renewal date and remaining days beside the device name. Open editing separately |
| [Insights](https://github.com/J-shw/Menstrudel/blob/09e31748776da7412e6c1b6be74dd70dd83b9536/docs/screenshots/android/logs_insights_screen.png) | Logged-day and tracking-duration counts precede symptom frequencies and cycle variation. Labels sit beside their values and the chart follows the summary | Show average cycle and the next estimate together. Keep detailed entries below the calendar. Additional symptom statistics require structured daily observations |

The screenshots establish visible hierarchy and states. They do not establish gesture behavior, accessibility or notification delivery. The native application was not run because Flutter is unavailable in this environment.

## Interaction code inspected

Paths below are relative to `app/lib` in the reference repository.

| Code | Observed behavior | Design implication |
| --- | --- | --- |
| `screens/dashboards/logs/logs_screen.dart` and `widgets/tabs/logs_screen_period_quick_view_tab.dart` | Today, Logs and Insights have distinct views. The Today view separates prediction, phase and loading states | Daily information should have a clear order rather than appearing as an undifferentiated list |
| `screens/dashboards/logs/widgets/journal_view.dart` | A calendar date creates or opens a log. Logged flow, Today and predicted dates have separate render paths | Calendar marks need distinct meanings and date selection needs a concrete destination |
| `widgets/sheets/symptom_entry_sheet.dart` | Flow uses single selection. Symptoms use multiple selection and support custom entries. Cancel leaves the sheet without saving | Use direct flow choices and a clear Save boundary. Stellis currently records period-level symptom notes rather than the reference's structured daily symptom model |
| `widgets/settings/regimen_setup_dialog.dart` | Name, active count, placebo count and start date define a regimen | Keep pack setup outside daily intake. Add common schedule presets while retaining custom counts |
| `screens/settings/sections/birth_control_settings_screen.dart` | The active regimen and reminder time are managed separately from the daily pack screen | Reminder configuration belongs in pack editing rather than occupying the daily action area |
| `screens/dashboards/pills_screen.dart` and `widgets/pills/pill_pack_visualiser.dart` | Current pack day and selected day are separate. Previous days can be selected. Intake status controls pack rendering. Intake changes reschedule reminders | Keep current day and selected date distinct. Store actions by full date so later packs cannot reuse an earlier pack's log |
| `screens/dashboards/reversible_contraceptive/reversible_contraceptive_screen.dart` and its `widgets/` | Records split into active and history groups. A record opens a detail sheet. Renewal uses configurable durations. Reminders choose the nearest active due date | Retain the active/history distinction. Stellis stores a user-entered renewal date and an explicit removal date rather than equating a passed renewal date with removal |

The reference implementation computes some pill write dates from regimen start plus selected pack-day number. Its selected-intake check also treats any intake record as a logged state. Stellis keeps date keys and distinct Taken and Skipped states. These are code-review findings rather than observed native runtime failures.

## Stellis interface

Cycle, Pills and Devices use a keyboard-accessible tab row. Each view presents its daily status or next action before history. The interface keeps Stellis typography, theme roles, focus treatment and primary action styling. Menstrudel's images and source code are not shipped with the application.

Cycle shows a larger DAY / number / OF named-cycle figure, average cycle and estimated next period alongside the shared My Health Calendar. The start date defines the figure. Log period lives in the shared Calendar header. Calendar rendering and cycle calculations use the [shared calendar components](../shared-calendars.md). People select a calendar day to add or edit an entry. Period history remains available below. An ongoing period offers End period. Flow choices appear directly in the editor. Overlapping periods are rejected. Estimates do not identify fertile days.

Pills shows current pack progress beside a seven-column pack. People select a past active day to mark Taken or Skipped and can undo either action. Date keys distinguish successive packs. Break and future days retain separate states. Pack setup offers 21 + 7, 24 + 4 and continuous presets with editable active and break counts. Reminder time stays in the pack editor.

Devices shows insertion and renewal dates with days until renewal. Removed devices retain their history and stop generating reminders. People enter the renewal date agreed with their clinician. The application does not assign a device lifespan.

Forms open as labelled native dialogs with a focus trap, Escape dismissal and focus restoration. Failed saves preserve entered values and show their error inside the dialog. Delete lives in editing rather than beside every record on the daily screen.

## Boundaries

Reminders appear while My Health is open. Background delivery remains unavailable. Period-level symptom notes do not provide the source's daily symptom analysis or pain history. The interface makes no fertility or contraceptive-effectiveness calculation.

Records use the existing account workspace database and API authentication boundary. Writes use bound SQL parameters and UI text uses DOM text nodes. No new dependency or external service is required. No sample health data is added to a person's workspace.

## Verification

`tests/test_reproductive.py` covers persistence, dose idempotence, distinct skipped doses, undo, break-day rejection, overlap validation, workspace separation, device removal and migration of existing dose dates.

`tests/browser/reproductive.mjs` exercises calendar logging, schedule presets, date-specific intake, skipping, undo, reload, device editing and removal, tab keyboard navigation and dialog focus restoration. With screenshot capture enabled it checks Cycle, Pills, Devices and all three editors at 360, 768, 1024, 1280 and 1920 pixels in both themes. Screenshot data comes from an isolated test workspace.

Reference feedback: screenshot inspection completed. The replacement interface is implemented. Browser and layout evidence is recorded in [Cycle interface evidence](../evidence/cycle-tracking/README.md).

User feedback on the day figure and calendar reuse is implemented: the day has a named-cycle caption and start-date context, the figure has no implied progress endpoint, Log period occupies the header, and date rendering is shared with the appointment calendar. The month view accepts multiple overlapping health tracks.

The Calendar is shared with appointments in both the interface and backend. Settings and onboarding ask whether the person experiences periods. Only an explicit Yes exposes Cycle and contraception and its calendar entries. The Calendar remains available regardless of that answer. Source records remain stored when tracking is hidden.
