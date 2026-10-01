---
doc_type: policy_version
policy_id: POL-LNP
version: v1
title: Simple Personal Loan Approval Policy
effective_from: 2025-05-01
source: data/external/policy-corpus/loan/simple_loan/simple_loan.txt
clauses:
- clause_id: LNP-1
  title: Personal loan eligibility criteria
  text: 'An applicant is eligible if all the following conditions are met: Age: Must be between 21 and 65 years old. Employment Status: Must be employed (full-time or part-time) or self-employed for at least 12 months. Monthly Income: Must have a minimum monthly income of $2,000. Credit Score: Must have a minimum credit score of 650. Debt-to-Income (DTI) Ratio: DTI must be less than or equal to 40%. Loan Amount Requested: Must not exceed 10 times the applicant’s monthly income.'
  checkable: false
- clause_id: LNP-2
  title: 'Personal loan auto-approval: credit score 700 and DTI 30%'
  text: 'Auto-Approval if all following conditions are met: All eligibility criteria are met. Credit score is 700 or higher. DTI is 30% or lower.'
  checkable: false
- clause_id: LNP-3
  title: Personal loan auto-rejection
  text: 'Auto-Rejection if: Credit score is below 600, or DTI is above 50%, or Applicant is unemployed or employed less than 12 months.'
  checkable: false
- clause_id: LNP-4
  title: Personal loan manual review
  text: 'Manual Review Required if eligibility criteria are met: Credit score is between 600–649, or DTI is between 41–50%, or Income verification is missing or ambiguous.'
  checkable: false
- clause_id: LNP-5
  title: Personal loan income verification, terms and interest rates
  text: 'Income Verification: Must be from recent pay slips, tax return, or bank statements. Loan Term Options: 12, 24, 36, or 48 months. Interest Rates are risk-based, tied to credit score bands.'
  checkable: false
---
# Simple Personal Loan Approval Policy (v1)

Effective from 2025-05-01.

**LNP-1 Personal loan eligibility criteria.** An applicant is eligible if all the following conditions are met: Age: Must be between 21 and 65 years old. Employment Status: Must be employed (full-time or part-time) or self-employed for at least 12 months. Monthly Income: Must have a minimum monthly income of $2,000. Credit Score: Must have a minimum credit score of 650. Debt-to-Income (DTI) Ratio: DTI must be less than or equal to 40%. Loan Amount Requested: Must not exceed 10 times the applicant’s monthly income.

**LNP-2 Personal loan auto-approval: credit score 700 and DTI 30%.** Auto-Approval if all following conditions are met: All eligibility criteria are met. Credit score is 700 or higher. DTI is 30% or lower.

**LNP-3 Personal loan auto-rejection.** Auto-Rejection if: Credit score is below 600, or DTI is above 50%, or Applicant is unemployed or employed less than 12 months.

**LNP-4 Personal loan manual review.** Manual Review Required if eligibility criteria are met: Credit score is between 600–649, or DTI is between 41–50%, or Income verification is missing or ambiguous.

**LNP-5 Personal loan income verification, terms and interest rates.** Income Verification: Must be from recent pay slips, tax return, or bank statements. Loan Term Options: 12, 24, 36, or 48 months. Interest Rates are risk-based, tied to credit score bands.
