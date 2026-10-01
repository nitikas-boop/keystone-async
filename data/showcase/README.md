# Showcase library: ingest-ready documents

20 real-world documents to demo Keystone end to end, in four formats. Tested in a freshly signed-up organisation:
**29/30 questions answered correctly** ([`expected-answers-new-org.json`](expected-answers-new-org.json)).

| Folder | Format | What it shows |
|---|---|---|
| `policies/` | 16 × `.md` with YAML front-matter | Policy versions split into citable clauses, with validity dates (as-of slider, version history) |
| `contracts/` | 2 × `.pdf`, 1 × `.txt`, 1 × `.docx` | Plain documents with no front-matter: dated by the uploader, answered from their text |

## Policies (`.md`)

14 sample policies from [DecisionsDev/policy-corpus](https://github.com/DecisionsDev/policy-corpus) (Apache-2.0).
Clause text is verbatim; the clause split, clause titles and effective dates are ours
(`python scripts/build_policy_corpus.py` regenerates them from `data/external/policy-corpus`).

| File | Policy | In force from |
|---|---|---|
| `POL-TOF-v1.md` | Acme Corp Time Off | 2024-01-01 |
| `POL-AML-v1.md` | Automated Detection of Money Laundering | 2024-04-01 |
| `POL-XBF-v1.md` | Cross-Border Fraud Detection, v1 (compact) | 2024-06-01 |
| `POL-LNU-v1.md` | Loan Approval (US) | 2024-09-01 |
| `POL-CAR-v1.md` | Car Insurance Eligibility | 2024-09-01 |
| `POL-LUG-v1.md` | SkyWings Airlines Luggage | 2024-11-01 |
| `POL-DSC-v1.md` | Acme Corp Discount Approval | 2025-01-01 |
| `POL-ENV-v1.md` | Air Pollution Compliance for Airplanes | 2025-01-01 |
| `POL-PAY-v1.md` | AetherSky Airways Pilot Compensation | 2025-02-01 |
| `POL-XBF-v2.md` | Cross-Border Fraud Detection, v2 | 2025-03-01 |
| `POL-CRD-v1.md` | Card Transaction Fraud Detection | 2025-03-01 |
| `POL-LNP-v1.md` | Simple Personal Loan Approval | 2025-05-01 |
| `POL-UWR-v1.md` | Underwriting Eligibility for Basic Insurance | 2025-05-01 |
| `POL-CDD-v1.md` | Customer Due Diligence / Enhanced Due Diligence | 2025-07-01 |
| `POL-BRD-v1.md` | Border Compliance for Imported Goods | 2025-08-01 |
| `POL-XBF-v3.md` | Cross-Border Fraud Detection, v3 (adds the audit-trail clause XBF-7) | 2026-01-15 |

Every clause is `checkable: false`: the compliance checker only evaluates retention-day and ₹ approval-threshold
fields, so these give cited answers, never a compliant / non-compliant verdict.

## Contracts (`.pdf`, `.txt`, `.docx`)

Short, complete commercial contracts from [CUAD](https://www.atticusprojectai.org/cuad) (CC BY 4.0). The `.docx` is
the CUAD text of the Watchit contract saved as Word. Upload each with the date and title below.

| File | Date to enter | Title to enter |
|---|---|---|
| `Web Hosting Agreement - Galacticomm.pdf` | 1997-09-09 | Web Hosting Agreement between Galacticomm and Horst Entertainment |
| `BISYS Outsourcing Agreement - United National Bancorp.txt` | 1999-02-18 | United National Bancorp outsourcing agreement with BISYS |
| `Managed Hosting Agreement - Deep Systems.pdf` | 2005-03-01 | Premium Managed Hosting Agreement between deep systems and AstroNutrition.com |
| `Content License Agreement - Watchit Media.docx` | 2006-09-01 | Content License Agreement between Watchit Media and Oceanic Time Warner Cable |

Their extracted facts wait in the Inbox for review; the answers below come from the document text and work before
any review. They are short on purpose: until retrieval searches whole documents, only about the first 2,000
characters of a plain document reach the answer.

## Upload

Needs the `reasoning-fixes` code (plain-document upload, per-org policy versions).

1. Create an organisation (you become its CEO), or sign in to Nimbus as **Farhan** or **Ananya**: only the CEO and the
   Compliance Lead may upload policy versions. For Nimbus, snapshot first if you want to go back:
   `powershell -File scripts/snapshot.ps1 -Name before-showcase`.
2. **Ingest Document → choose all 16 files in `policies/` at once → Upload all.** The picker's name order uploads the
   `POL-XBF` versions as v1, v2, v3.
3. **Ingest Document → each file in `contracts/` on its own**, entering the date and title from the table.
4. Ask the questions below with the timeline set to the as-of date.

## Expected answers

| # | As of | Question | Expected answer | Cites |
|---|---|---|---|---|
| Q01 | 2026-09-30 | How many weeks of vacation does an employee with 12 years of service get? | 4 weeks per year | TOF-4 |
| Q02 | 2026-09-30 | Can unused personal sick time be carried over to the next year? | No (unless law requires it) | TOF-6 |
| Q03 | 2026-09-30 | Can supplemental employees earn personal choice holidays? | No | TOF-3 |
| Q04 | 2026-09-30 | Who must approve a 15% discount on a $12,000 deal? | A Sales Manager. **Known failure:** the model applies only the tier rule and says a sales rep can | DSC-2 |
| Q05 | 2026-09-30 | Maximum discount a sales rep can give a Tier 3 startup without further approval? | 10% | DSC-1 |
| Q06 | 2026-09-30 | Minimum gross margin allowed after a discount? | 30%, unless the VP of Sales approves | DSC-3 |
| Q07 | 2026-09-30 | Signing bonus for a newly hired First Officer pilot? | $10,000 | PAY-2.2 |
| Q08 | 2026-09-30 | Per diem for pilots on international assignments? | $5.00 per hour | PAY-3 |
| Q09 | 2026-09-30 | At what amount must a single transaction be flagged for money laundering? | 10,000 USD or more | AML-1 |
| Q10 | 2026-09-30 | When is an account considered dormant for AML monitoring? | No activity for 180 consecutive days | AML-4 |
| Q11 | 2026-09-30 | When do we have to apply enhanced due diligence? | PEPs, EU/FATF high-risk countries, wealth ≥ €50 million, self-hosted crypto wallets | CDD-2 |
| Q12 | 2026-09-30 | How long must customer due diligence records be retained? | At least five years after the relationship ends | CDD-4 |
| Q13 | 2026-09-30 | What does a personal loan need to be auto-approved? | Credit score ≥ 700 and DTI ≤ 30% | LNP-2 |
| Q14 | 2026-09-30 | Maximum debt-to-income ratio under the US loan policy? | 40% | LNU-3 |
| Q15 | 2026-09-30 | Excess baggage fee for an oversized bag? | $100 per bag | LUG-5 |
| Q16 | 2026-09-30 | Are imported electronics shipments subject to customs inspection? | Yes | BRD-5 |
| Q17 | 2026-09-30 | By what date must annual aircraft emissions reports be submitted? | March 31 for the preceding year | ENV-1 |
| Q18 | **2025-06-01** | What happens to a cross-border transaction with a fraud risk score above 60? | Blocked, compliance team notified (v2) | XBF-6@v2 |
| Q19 | **2026-03-01** | Same question | Blocked, EDD / SAR process started (v3) | XBF-6@v3 |
| Q20 | 2026-03-01 | What must be recorded for every flagged cross-border transaction? | Geo-IP, merchant jurisdiction, currency path, AML/KYC status, sanctions flags | XBF-7@v3 |
| Q21 | 2025-06-01 | Maximum discount for Tier 1 enterprise customers without further approval? | 20% | DSC-1 |
| Q22 | **2024-06-01** | Same question | Refused: the discount policy starts 2025-01-01 | — |
| Q23 | 2026-09-30 | Why did we choose MongoDB? | Refused | — |
| Q24 | 2026-09-30 | What is our remote work policy? | Refused | — |
| Q25 | 2026-09-30 | How many weeks of parental leave do employees get? | Refused: not in the time-off policy | — |
| Q26 | 2026-09-30 | How much does Horst Entertainment pay Galacticomm per access under the web hosting agreement? | $0.01 per access up to 400,000, then $0.005 | the `.pdf` |
| Q27 | 2026-09-30 | What is the monthly fee in the managed hosting agreement with deep systems? | $175 per month | the `.pdf` |
| Q28 | 2026-09-30 | What server uptime does deep systems guarantee in the managed hosting agreement? | 99 percent | the `.pdf` |
| Q29 | 2026-09-30 | Which company will provide information processing services to United National Bank? | BISYS | the `.txt` |
| Q30 | 2026-09-30 | What is the cancellation fee in the Watchit content license agreement? | $5,000 per remaining month | the `.docx` |

Refusals are the exact sentence "I have no recorded decision about that".

Re-run the check (new organisation, isolated test database) after a prompt or model change:

```bash
docker compose cp data/showcase backend:/tmp/showcase
docker compose exec -e PYTHONPATH=/app backend python tests/simulate_showcase.py /tmp/showcase --new-org
docker compose cp backend:/tmp/showcase/expected-answers-new-org.json data/showcase/
```

On Windows Git Bash, prefix with `MSYS_NO_PATHCONV=1` so `/app` and `/tmp` are not rewritten.
