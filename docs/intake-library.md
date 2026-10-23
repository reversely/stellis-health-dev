# Intake reference library

Setup offers editable goal categories and health topics from the existing notebook catalogue. Medicine search uses a bundled RxTerms names snapshot from the National Library of Medicine. Queries stay in the authenticated account server. A selected name fills an editable field; the person confirms the answer before setup saves it.

The snapshot contains RxNorm identifiers and generic, branded and pack display names from [RxTerms getAllConcepts](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxTerms.getAllConcepts.html). It provides names for recognition rather than prescribing information. It does not cover every supplement or medicine worldwide; people can type their answer.

To refresh, download the official response from `https://rxnav.nlm.nih.gov/REST/RxTerms/allconcepts.json` and run `python3 scripts/refresh_medicine_terms.py response.json`. The script accepts a local input file and writes the bundled names. Review the resulting data diff and run `tests.test_intake_library`.

Attribution follows the [RxNav terms of service](https://lhncbc.nlm.nih.gov/RxNav/TermsofService.html):

This product uses publicly available data from the U.S. National Library of Medicine (NLM), National Institutes of Health, Department of Health and Human Services; NLM is not responsible for the product and does not endorse or recommend this or any other product.
