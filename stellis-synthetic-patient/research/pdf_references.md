# Verified PDF references

Every original John Snow Labs PDF was downloaded and inspected: 30 Easy, 10 Medium, 10 Hard. Its 21 supplied output PDFs were also inspected. All 50 clean Root Cause Analytics PDFs were text-extracted; representative document families were rendered and visually inspected. The 27-page MyFertility sample and accepted specialty samples were inspected in full.

Primary references have explicit synthetic statements or explicit testing-account evidence. Supplemental demo reports with uncertain clinical-data provenance cannot satisfy the synthetic-reference requirement alone. Clinical recommendations come from the separate authoritative source list, not from these examples. Original PDFs, identities, logos, photographs, and wording are excluded from the archive.

## jsl-easy

Direct PDF: https://raw.githubusercontent.com/JohnSnowLabs/pdf-deid-dataset/main/PDF_Original/Easy/PDF_Deid_Deidentification_0.pdf

Project: John Snow Labs. Type: Generic outpatient encounter. Pages: 3.

Synthetic status: Fully synthetic; publisher states Faker and Gemini, no real patient data.

Layout: Lavender section strips; patient demographics; lifestyle; vitals; doctor notes; visit, medication and test tables.

Use: layout. Limitation: Generic clinical format only; example clinical content is inconsistent and is not reused.

Reuse: No licence file in repository tree at inspection. Viewing does not grant redistribution.

Verification: HTTP download, PDF signature, all pages extracted/rendered; SHA-256 `4045742093b3f45efdca3b8230c37f6ad3d94bb067bfaf95f09552ab3b6180d9`.

## rca-note

Direct PDF: https://huggingface.co/datasets/RootCauseAnalytics/synthetic-australian-medical-documents-sample/resolve/main/pdfs/0010_progress_note_COVID_PNEUMONIA_Green.pdf

Project: Root Cause Analytics. Type: Progress note. Pages: 1.

Synthetic status: Publisher explicitly states every entity and clinical history is synthetic.

Layout: Facility masthead; pale patient block; dated author panel; dark SOAP strips; signed author footer.

Use: layout. Limitation: Inpatient respiratory note used for SOAP layout only, not outpatient or obstetric content.

Reuse: CC BY-NC 4.0; attribution required; commercial reuse needs separate licence.

Verification: HTTP download, PDF signature, all pages extracted/rendered; SHA-256 `17fb5056d5d84f7a8d2997e61844b88dea0d3994f001de16fef18e48021e7bfc`.

## rca-letter

Direct PDF: https://huggingface.co/datasets/RootCauseAnalytics/synthetic-australian-medical-documents-sample/resolve/main/pdfs/0006_referral_letter_COLON_CA_Powell.pdf

Project: Root Cause Analytics. Type: Specialist referral letter. Pages: 2.

Synthetic status: Publisher explicitly states every entity and clinical history is synthetic.

Layout: Letterhead; recipient; RE and DOB panel; salutation; history, investigations, request; closing and cc.

Use: layout. Limitation: Colorectal referral used for correspondence layout only; specialty content not reused.

Reuse: CC BY-NC 4.0; attribution required; commercial reuse needs separate licence.

Verification: HTTP download, PDF signature, all pages extracted/rendered; SHA-256 `7c2e178c0b08d2b161afd744e94b1d648b2bd4b3b0587161b0498e547cee2f90`.

## rca-rx

Direct PDF: https://huggingface.co/datasets/RootCauseAnalytics/synthetic-australian-medical-documents-sample/resolve/main/pdfs/0001_prescription_DEPRESSION_GAD_Edwards.pdf

Project: Root Cause Analytics. Type: Prescription. Pages: 1.

Synthetic status: Publisher explicitly states every entity and clinical history is synthetic.

Layout: Patient and prescription identifiers; drug, strength, route, frequency, quantity, repeats grid; prescriber authorization.

Use: layout. Limitation: Australian prescription conventions adapted to an original Canadian test prescription; no PBS or Medicare fields.

Reuse: CC BY-NC 4.0; attribution required; commercial reuse needs separate licence.

Verification: HTTP download, PDF signature, all pages extracted/rendered; SHA-256 `ed59cbab8195cc23d409ea59377993624b1e4343eef04e9b492641af6ec4d808`.

## rca-image

Direct PDF: https://huggingface.co/datasets/RootCauseAnalytics/synthetic-australian-medical-documents-sample/resolve/main/pdfs/0005_imaging_report_POLYTRAUMA_Foster.pdf

Project: Root Cause Analytics. Type: Imaging report. Pages: 1.

Synthetic status: Publisher explicitly states every entity and clinical history is synthetic.

Layout: Two-column patient/study panel; teal indication, technique, findings, impression strips; radiologist authorization.

Use: layout. Limitation: Trauma MRI used for radiology layout only. No verified fully synthetic obstetric or follicle ultrasound report was located.

Reuse: CC BY-NC 4.0; attribution required; commercial reuse needs separate licence.

Verification: HTTP download, PDF signature, all pages extracted/rendered; SHA-256 `f00cb798ae9da0c9fbfece2b3ddcd3d1080c9c3f141694ec6e0f4d8275f6c04e`.

## rca-procedure

Direct PDF: https://huggingface.co/datasets/RootCauseAnalytics/synthetic-australian-medical-documents-sample/resolve/main/pdfs/0035_anaesthetic_record_CHOLELITHIASIS_Morris.pdf

Project: Root Cause Analytics. Type: Procedure and anaesthetic record. Pages: 2.

Synthetic status: Publisher explicitly states every entity and clinical history is synthetic.

Layout: Theatre and procedure times; preoperative assessment; administered drugs table; observation table; fluids and recovery.

Use: layout. Limitation: Surgical anaesthetic format used for retrieval and delivery layout only; source medication entries are not clinical guidance.

Reuse: CC BY-NC 4.0; attribution required; commercial reuse needs separate licence.

Verification: HTTP download, PDF signature, all pages extracted/rendered; SHA-256 `95b3be073bb4abfd4b0d2c52931f760974a577afb8165b6f7d610e1ee6392a56`.

## rca-discharge

Direct PDF: https://huggingface.co/datasets/RootCauseAnalytics/synthetic-australian-medical-documents-sample/resolve/main/pdfs/0033_discharge_summary_CAP_PNEUMONIA_Khan.pdf

Project: Root Cause Analytics. Type: Hospital discharge summary. Pages: 2.

Synthetic status: Publisher explicitly states every entity and clinical history is synthetic.

Layout: Hospital masthead; admission/discharge block; diagnoses; hospital course; discharge medication table; follow-up and recipient.

Use: layout. Limitation: Pneumonia discharge layout only; no verified fully synthetic maternity discharge PDF located.

Reuse: CC BY-NC 4.0; attribution required; commercial reuse needs separate licence.

Verification: HTTP download, PDF signature, all pages extracted/rendered; SHA-256 `e4440e57f61ff764f039a84f53710910fd9acbe2b6af73e71f9ad55991ea642b`.

## fert-assessment

Direct PDF: https://apjoppkptzdaztmprijk.supabase.co/storage/v1/object/public/public_bucket/sample-reports/myfertility-report-sample.pdf

Project: MyFertility Report. Type: Patient fertility assessment. Pages: 27.

Synthetic status: Originating sample-report page explicitly identifies a synthetic assessment and no real patient information.

Layout: Cover; report guide; summary; action table; reproductive history; test and treatment explanations; running footer.

Use: layout. Limitation: Patient education reference for assessment structure, not a specialist examination or laboratory result. No source prose copied.

Reuse: Copyright 2026 MyFertility Report; all rights reserved. No redistribution or text/artwork copying.

Verification: HTTP download, PDF signature, all pages extracted/rendered; SHA-256 `09d5970025b7caf312b87cae955dc7aa1a099830da8e4b1634e695b3274ae4aa`.

## lab-pap

Direct PDF: https://files.labcorp.com/testmenu-d8/sample_reports/193000.pdf

Project: Labcorp test menu 193000. Type: Liquid-based cervical cytology. Pages: 4.

Synthetic status: Demonstration testing record: patient SAMPLE REPORT, 193000; CoPath testing account; test cytotech signatory. This is a test report rather than a de-identified record.

Layout: Accession and account header; patient/specimen/physician columns; ordered test; specimen source; interpretation; adequacy; comments; signatory.

Use: layout. Limitation: Verified test-account example; source facility and some administrative identities are real and excluded from generated corpus.

Reuse: Labcorp all rights reserved; no open reuse licence. Original labels and ordinary field concepts only.

Verification: HTTP download, PDF signature, all pages extracted/rendered; SHA-256 `815345178d226b883b16e26d8e80fae61f1d48ca3c254cdac4a3b749c7023976`.

## lab-prenatal

Direct PDF: https://files.labcorp.com/testmenu-d8/sample_reports/144053.pdf

Project: Labcorp test menu 144053. Type: Initial prenatal laboratory panel. Pages: 7.

Synthetic status: Test-account sample: SAMPLE REPORT, 144053 patient; LabCorp Test Master account. Normal and abnormal demonstrations are explicitly labelled.

Layout: Seven-page normal/abnormal example packet; demographics and specimen dates; analyte/result/unit/reference/indicator columns; serology and haematology; urinalysis and culture.

Use: layout. Limitation: Visual inspection of all seven pages required because most table content is rasterized. Normal-example pages 1-3 guide field selection; abnormal examples are not adopted.

Reuse: Labcorp all rights reserved; no open reuse licence. No source assets or text reproduced.

Verification: HTTP download, PDF signature, all pages extracted/rendered; SHA-256 `00e90b0bd874be2ff3ebabcb6fd7d5060fb5be05159fe0d1407ac9060ceaa94a`.

## prenatal-marker

Direct PDF: https://pathofast.com/report_pdfs_new/double-marker-test.pdf

Project: Pathofast laboratory. Type: First-trimester maternal serum screening. Pages: 2.

Synthetic status: PDF explicitly states dummy patient and dummy doctor.

Layout: Patient/report columns; analyte/result/reference table; risk ratios; impression; methods; limitations; authorization.

Use: layout. Limitation: Specialized prenatal laboratory reference; marker values and risk calculations in the sample are not adopted.

Reuse: No open reuse licence located. Linked for inspection; no copying or redistribution.

Verification: HTTP download, PDF signature, all pages extracted/rendered; SHA-256 `3ea0e1e603a5fbf7d46502bac12435ae087500c895f678e767534d19f8f97c03`.

## embryology-demo

Direct PDF: https://myembryoiq.com/assets/sample-report.pdf

Project: MorphIQ by ClearviewBio. Type: Embryology overview and scorecards. Pages: 5.

Synthetic status: Illustrative demo inferred from Jane Doe, John Doe, Dr Doe and placeholder upload-image instructions; embedded embryo photographs have unverified provenance. Publisher labels sample report but does not explicitly certify all clinical values synthetic.

Layout: Patient/partner/retrieval row; embryo overview; per-embryo tables; grade reference; disclosures.

Use: layout. Limitation: Supplemental layout only. Unconfirmed full synthetic provenance. AI scores and morphology-to-ploidy claims are not adopted. Always paired with an explicitly synthetic primary PDF.

Reuse: All rights reserved; research-use-only product notice, not an open copyright licence.

Verification: HTTP download, PDF signature, all pages extracted/rendered; SHA-256 `6dc389b5c2cce87c026cbc3d51344f5b9312f6d7add45caa2ba5103ddef14d36`.

## nipt-demo

Direct PDF: https://gc-genome.com/wp-content/uploads/2023/09/GCG_G-NIPT_SR_v1.pdf

Project: GC Genome. Type: Noninvasive prenatal screening report. Pages: 3.

Synthetic status: Public demonstration with Jane Doe and Hospital A; full synthetic provenance not explicitly certified.

Layout: Patient/specimen block; pregnancy and QC grid; fetal fraction; chromosome/result/risk table; limitations.

Use: layout. Limitation: Supplemental layout only, paired with explicitly synthetic prenatal-marker reference. Low-risk result is a screen, not a confirmed diagnosis.

Reuse: No open reuse licence located. No redistribution or copying.

Verification: HTTP download, PDF signature, all pages extracted/rendered; SHA-256 `5d93fc331f861565dfa6574130f5abe5b1e2dc2657dcc461f5470b28a18aee4c`.

## Search outcomes

Searches covered synthetic, dummy, fictitious, demo, sample patient and sample report variants for each requested specialty, GitHub, Hugging Face, NLP/OCR datasets and laboratory/vendor test menus. Additional candidates and rejection reasons are in search_log.json. Report availability alone does not establish synthetic status.

Specialized sources found: cervical cytology test-account report, synthetic first-trimester serum screen, fertility assessment, and illustrative embryology/NIPT reports. Fully synthetic follicular-monitoring, obstetric ultrasound, delivery, and postpartum PDFs were not verified. Those entries use explicit synthetic procedural, imaging or progress-note references and disclose the specialty gap individually.

Machine-readable complete source inventory: corpus_inspection_inventory.json. Document-by-document source assignment: document_reference_inventory.json.
