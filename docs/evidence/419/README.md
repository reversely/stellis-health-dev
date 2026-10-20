# #419 recording destination

Direct PDF page 6 inspection showed Saving to / Change, absent from the implementation. The recording rail now shows the current notebook and an inline Change form using real notebook options, No notebook, Save and Cancel. It works before capture, during capture and while reviewing an unfinished recording.

Actual GN100 browser verification used the real PipeWire inputs from #418. A preselected Project planning notebook was stored at start, changed to Research during capture, retained through title rename and invalid-destination rejection, and present on the finalized conversation. A second recording was interrupted by reload, reviewed, assigned to Project planning, cleared to No notebook, and recovered with that exact destination. Real audio remained decodable after finalization. No media or persistence APIs were mocked.

Desktop and phone screenshots in both themes were visually inspected, including the expanded form and keyboard traversal. Initial expanded-form buttons inherited browser defaults and were corrected to the existing control style and 44px targets. Seven-width recording audits in both themes have zero failures and warnings.

315 Python tests and 25 subtests passed (one skipped); 158 JavaScript tests passed. The new integration test uses real encoded WebM and covers assignment/clear, invalid IDs, rename projection, finalization, saved notebook identity and mutation conflicts. One preceding full run hit an unrelated temporary-directory cleanup race; targeted tests and the next full run passed. The unresolved isolation investigation is #422, not hidden by retries in the test code.
