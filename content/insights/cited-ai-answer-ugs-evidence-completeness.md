---
title: "Why a Cited AI Answer Is Not Proof That UGS Evidence Is Complete"
slug: "/insights/cited-ai-answer-ugs-evidence-completeness"
meta_title: "UGS Evidence Completeness Beyond AI Citations"
meta_description: "Why citations alone cannot establish evidence completeness in underground natural gas storage, and how operators can test AI-assisted review safely."
date: "2026-09-05"
date_modified: "2026-09-05"
author: "Kataba"
category: "Underground Natural Gas Storage"
category_label: "UNDERGROUND NATURAL GAS STORAGE"
breadcrumb_label: "UGS"
card_label: "PRACTICAL GUIDE"
inline_cta_after: "Completeness has more than one dimension"
crosslink_link_text: "Read why a citation isn't proof of completeness"
draft: false
review_status: "Approved for publication"
excerpt: "A citation can show where an AI-generated statement came from. It cannot show whether the full UGS evidence chain was reviewed, whether the source was applicable, or whether a required record is missing."
---

# Why a Cited AI Answer Is Not Proof That UGS Evidence Is Complete

An AI assistant searches an underground natural gas storage document repository and returns this answer:

> Well A annular pressure is monitored in accordance with Procedure UGS-014.

The answer includes a link to the procedure and the correct page. The citation is real. The statement is supported.

But several questions remain unanswered:

- Was the cited revision effective during the period under review?
- Does the procedure define the applicable monitoring frequency and threshold?
- Are records present for the entire required period?
- Did any reading exceed an applicable limit?
- If an exception occurred, do records show that it was evaluated and addressed according to procedure?

The cited answer may be factually correct and still be incomplete for the decision being made.

This is the central limitation of using citations as a proxy for assurance. A citation can establish provenance for a statement. It does not establish that every required evidence category was identified, retrieved, reconciled and reviewed.

For UGS operators evaluating AI-assisted inspection preparation, procedure review or integrity work, that distinction is more important than answer fluency.

## PHMSA's inspection structure makes the distinction visible

Section 192.12 of 49 CFR requires each UGS operator to prepare and follow facility procedures for operations, maintenance, and emergency preparedness and response. It also requires records necessary to administer those procedures. The integrity-management provisions require written procedures and records that demonstrate compliance and support specified decisions, calculations, changes, justifications, determinations and actions.

PHMSA's January 2026 Gas Transmission Inspection Assistant question set illustrates how this becomes a practical evidence problem. For annular-gas monitoring, the question set separately asks whether:

1. Procedures require regular measurement and recording of annular pressure or flow.
2. Records demonstrate that monitoring occurred according to procedure.
3. Procedures define a threshold or limit.
4. Records demonstrate whether the threshold or limit was exceeded.
5. The process requires evaluation of occurrences above applicable threshold levels.
6. Records demonstrate that such occurrences were evaluated according to procedure.

This sequence matters. A correct citation to a monitoring procedure answers only part of the inspection logic. A correct citation to one monitoring record answers only another part. Neither proves that the whole chain is present or that the record set covers the applicable wells and review period.

The question set is useful here as a public illustration of inspection logic, not as a substitute for determining the requirements applicable to a particular facility or as a complete crosswalk to the second editions of API RP 1170 and RP 1171. The governing regulation, incorporated standard, facility type, state requirements, operator procedures and relevant period still need to be established for the review.

The broader principle is simple:

> **A citation shows that a statement has support. Evidence assurance tests whether the decision has enough applicable support to be defensible.**

## Five questions that should not be treated as interchangeable

AI demonstrations often compress several different quality questions into one: "Did the system provide a cited answer?" A serious UGS review should separate at least five.

| Question | What it establishes | What it does not establish |
| --- | --- | --- |
| **Is the citation real?** | The referenced source and location exist. | The source supports the full claim. |
| **Does the source support the claim?** | The cited content entails the specific statement. | The source is current, applicable or authoritative. |
| **Is the source applicable?** | The record matches the facility, well, activity, revision and period under review. | Other required evidence is present. |
| **Is the evidence set sufficient?** | The defined evidence categories needed for the question have been addressed. | The reviewed corpus contains every record that exists elsewhere. |
| **Is the conclusion defensible?** | A qualified reviewer accepts the evidence, limitations and reasoning for the intended use. | The conclusion applies outside the documented scope. |

A conventional retrieval-augmented generation system can perform well on the first two questions. With careful configuration, it may help with all five. But it does not know what a complete UGS evidence set should contain merely because it can retrieve relevant passages and generate citations.

That completeness standard must be defined explicitly.

## How a cited answer can still create false assurance

Several failure modes are especially relevant to UGS records.

### The system finds support but does not search for disconfirming evidence

Retrieval is usually optimized to return passages relevant to the user's wording. If the corpus contains ten sources that support an answer and one source that conflicts with it, the conflicting source may never enter the context used by the language model.

The answer may therefore be cited accurately while failing to disclose a disagreement that a reviewer would consider material.

### The procedure is current, but the work occurred under an earlier revision

A search system may prefer a clean, current procedure over an older scanned revision. For a historical inspection period, acquisition review or workover, however, the relevant question may be what procedure and limit applied when the activity occurred.

Finding the newest document is not the same as finding the applicable document.

### One record is mistaken for complete time coverage

A retrieved monitoring sheet proves that at least one record exists. It does not prove that the required interval is covered without gaps. Coverage must be tested against an expected date range, frequency and population of wells or assets.

### A referenced appendix or limit table is absent

A procedure may state that personnel must act when a value exceeds the limit in a separate table. The procedure can be retrieved and cited correctly even when the governing table is missing from the reviewed corpus.

Without the table, the system may describe the process but cannot determine which values required action.

### Similar facility or well names are combined

Legacy records can use aliases, old operator names, historical well numbers or inconsistent facility identifiers. A semantically relevant record for Well 12 may be incorrectly associated with 12A, a recompleted well, or the same identifier at another field.

Page-level citation does not correct an entity-resolution error.

### OCR converts an image into searchable but unreliable text

Many UGS record collections contain scans, typed forms, marginal notes, tables, faded plots and handwritten legacy records. Modern optical character recognition and handwriting recognition can make these sources far more discoverable. They can also misread numbers, units, dates and identifiers.

OCR output should therefore retain a link to the source image, a confidence signal where available, and a route for human verification. A citation to extracted text is not enough when the decisive value must be checked against the original record.

### "Not retrieved" is silently interpreted as "does not exist"

The system may fail to find a record because it is poorly scanned, stored under an unexpected name, excluded from the approved corpus or held in a database that was not connected to the review.

The defensible statement is **not found in the reviewed corpus**. It is not **the operator has no record**.

This distinction protects both technical accuracy and the credibility of the review.

## Completeness has more than one dimension

A May 2025 PHMSA warning letter provides a useful public example of why record count alone is not enough. PHMSA alleged, among other matters, that:

- Annular-pressure records were available for three wells, but the monitored primary annulus was being used to introduce storage gas. PHMSA's position was that the readings did not demonstrate monitoring for the condition at issue.
- One risk tool included fewer than ten third-party wells, while other records identified 93 potential third-party wells.
- Monthly wellhead-pressure records were missing across portions of several years even though the operator's procedure called for the records.

These were allegations in a warning letter, not findings reproduced here as a final adjudication. Their value for system design is that they expose three different completeness tests:

1. **Measurement validity** - Does the record measure the condition the reviewer thinks it measures?
2. **Population coverage** - Does the analysis include the full applicable population of wells or other assets?
3. **Time-series coverage** - Do records cover the expected interval without unexplained gaps?

A document assistant can cite a real pressure record and still miss all three tests.

## From document search to evidence coverage

The difference between a cited answer and an evidence-assurance workflow is not a claim that one language model is smarter than another. It is a difference in what the system is designed to account for.

A UGS evidence-assurance workflow needs four connected layers.

### 1. A controlled corpus inventory

Before answering questions, the review needs to know what sources are available and what is outside scope. The inventory should capture, where applicable:

- Document identity and type
- Facility and well associations
- Owner or source system
- Revision and effective dates
- Record period
- Control or approval status
- OCR status and extraction quality
- Superseded or duplicate relationships
- Referenced documents and attachments

This does not prove that the operator's enterprise record is complete. It defines the corpus against which the result can honestly be qualified.

### 2. A question-specific evidence model

The system must represent what evidence categories are expected before it evaluates what was found.

For an illustrative annular-monitoring question, the model might call for:

1. Facility, well and review-period identity
2. Applicable procedure and revision
3. Monitoring method and frequency
4. Applicable operator-defined or regulatory criterion
5. Records covering the expected period
6. Identification of exceptions or exceedances
7. Prescribed evaluation or response
8. Evidence that the evaluation or response occurred
9. Qualified review and disposition

The exact chain will vary with facility type, operator procedures, applicable requirements and the question being answered. It must be configured and approved by qualified personnel, not inferred as a universal checklist from this example.

### 3. Hybrid retrieval and normalization

UGS evidence is not limited to paragraphs in PDFs. A practical review may need to combine:

- Semantic search for conceptually related passages
- Exact keyword search for identifiers, form names and technical terms
- Metadata filters for facility, well, document type and period
- OCR and handwriting recognition for legacy records
- Table and form extraction
- Queries to approved structured databases
- Cross-reference tracing among procedures, appendices, forms and records
- Unit, date, identifier and terminology normalization

Semantic search is valuable because the same concept may be expressed differently across decades of records. Exact search is equally important because a well number, revision code or threshold value should not be approximated semantically.

The workflow should use both, then preserve lineage back to the authoritative source.

### 4. Explicit coverage tests and reviewer disposition

The result should account for every expected evidence category, not merely assemble the most relevant retrieved passages.

Useful coverage states include:

| Status | Meaning |
| --- | --- |
| **Present and current** | The expected source was identified and appears applicable to the scope. |
| **Present - verification required** | A candidate source was found, but identity, applicability, extraction or authority remains unresolved. |
| **Missing from reviewed corpus** | No acceptable source was found within the defined corpus. |
| **Wrong period or revision** | A source exists but does not match the applicable time or controlled version. |
| **Conflicting** | Two or more sources support materially different values or conclusions. |
| **Not applicable** | A qualified reviewer documented why the evidence category does not apply. |
| **Insufficient evidence** | One or more required links remain unresolved, so the requested conclusion should not be presented as complete. |

Some checks can be deterministic: Does the record set cover every expected month? Is the referenced appendix present? Does the well identifier match the question? Was the cited procedure effective on the activity date? Are required fields populated?

Other decisions require engineering or regulatory judgment: Is the procedure technically adequate? Is an exception material? Which conflicting source is authoritative? Is the evidence sufficient for the intended conclusion?

The workflow should make that boundary visible.

## What a more defensible answer looks like

Consider this fictional response:

> Procedure UGS-014 Rev. 6 requires periodic annular-pressure monitoring for Well A [page 12]. Records were identified for January through March 2026. No acceptable monitoring records for April through June were found in the reviewed corpus. The procedure references Facility Limit Table LT-03, but the applicable revision of that table was not included. The review therefore cannot determine whether the expected period is complete or whether any reading required evaluation. **Status: insufficient evidence.** Requested next sources: April-June monitoring records and the effective revision of LT-03.

This response is stronger because it distinguishes four things:

- What the cited procedure establishes
- What implementation records were found
- What was not found in the bounded corpus
- Which conclusion cannot yet be supported

It does not accuse the operator of lacking records. It does not make a compliance determination. It gives a qualified reviewer a precise evidence request and a traceable basis for the provisional status.

## Measuring what matters

An AI evaluation based only on whether users like the answer will not test this problem. A bounded UGS proof of concept should compare the system against an SME-approved answer key and required-record set.

Useful measures include:

### Required-record recall

Of the records or evidence categories that reviewers identified as necessary, how many did the workflow locate and correctly associate with the question?

### Citation correctness

Does each citation exist, point to the correct location and support the exact claim made?

### Applicability accuracy

Did the workflow select the correct facility, well, procedure revision, record period and source authority?

### Gap-detection accuracy

Did it correctly identify missing, stale or conflicting evidence without inventing gaps caused by naming or ingestion errors?

### Appropriate abstention

When the evidence chain was incomplete, did the system state the limitation and avoid an unsupported conclusion?

### False-clean rate

How often did the workflow report a matter as complete, covered or otherwise resolved when a required link was absent or inapplicable?

This is the most consequential failure mode. A system can achieve high citation accuracy and still have an unacceptable false-clean rate if it cites what it found but does not account for what the decision required.

### Reviewer acceptance and time

Did designated UGS reviewers accept the evidence matrix and its limitations? How much time was required to assemble, verify and disposition the package compared with the current process?

No single percentage should be marketed as universal performance. The corpus, questions, ground truth, reviewer qualifications and error definitions must be agreed before testing.

## A limited POC is the credible starting point

The safest way to evaluate an evidence-assurance workflow is not an enterprise rollout. It is a deliberately constrained historical test.

A practical starting scope could include:

- One facility or operating entity
- One completed inspection, procedure review or integrity workflow
- A limited and approved corpus, isolated or redacted as required
- Ten to fifteen questions selected with the operator
- An SME-approved evidence model and expected-record set
- Read-only access and no production-system writes

The agreed deliverables might include:

- A controlled source register
- A question-to-evidence coverage matrix
- Exact document, page, table and record citations
- A missing, stale and conflicting evidence log
- Original-image links for material OCR extractions
- Reviewer comments and final disposition
- A scored comparison with the operator's current process

Acceptance criteria should be set before the system is run. At minimum, they should address required-record recall, citation correctness, facility and version accuracy, false-clean conclusions, reviewer acceptance and evidence-assembly time.

That structure gives a sophisticated operator a rational basis to decide whether the workflow adds value beyond its current repositories, enterprise search, internal AI capabilities or existing technology partners.

## The durable distinction

Kataba uses retrieval and foundation models. Semantic search, exact search, OCR, database ingestion and language-model reasoning are enabling technologies, not the final product claim.

Kataba is developing a UGS evidence-assurance workflow that begins by defining the evidence a question requires, accounts for each required link, and gives qualified reviewers a precise view of what is supported, what conflicts and what remains unresolved.

The relevant comparison is therefore not "our model versus your model." It is:

> **Can the workflow demonstrate, against an agreed UGS ground truth, that it finds the required records, applies them to the correct asset and period, exposes missing links, and avoids false-clean conclusions?**

That is a claim a POC can test.

**Have a completed UGS workflow that would make a good controlled test? [Discuss a bounded UGS proof of concept](https://kataba.ai/ugs#cta).**

---

## Sources

- [Electronic Code of Federal Regulations: 49 CFR 192.12](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-I/subchapter-D/part-192/subpart-A/section-192.12)
- [PHMSA: Underground Natural Gas Storage](https://www.phmsa.dot.gov/pipeline/underground-natural-gas-storage/underground-natural-gas-storage)
- [PHMSA: Gas Transmission Inspection Assistant Question Set, January 2026](https://www.phmsa.dot.gov/sites/phmsa.dot.gov/files/2025-12/PHMSA-Gas-Transmission-GT-2026-01-IA-Question-Set-January-2026.pdf)
- [PHMSA: May 2025 Underground Natural Gas Storage Warning Letter](https://primis.phmsa.dot.gov/enforcement-documents/12025019WL/12025019WL_Warning%20Letter_05292025_(24-296372)_text.pdf)
- [PHMSA: Underground Natural Gas Storage Facility Safety Site Assessment Summary](https://www.phmsa.dot.gov/sites/phmsa.dot.gov/files/docs/technical-resources/pipeline/underground-natural-gas-storage/59331/finalreportphmsaugssiteassessmentsummary10202017d.pdf)
- [PHMSA: UNGS Frequently Asked Questions](https://www.phmsa.dot.gov/sites/phmsa.dot.gov/files/2022-03/UNGS%20Frequently%20Asked%20Questions.pdf)

*This article describes a technical evidence-review workflow. It is not legal advice, does not reproduce the API standards, and does not make a compliance or engineering determination for any operator or facility.*
