---
doc_type: policy_version
policy_id: POL-XBF
version: v1
title: Cross-Border Fraud Detection Policy
effective_from: 2024-06-01
source: data/external/policy-corpus/fraud-detection/compact.txt
clauses:
- clause_id: XBF-1
  title: 'Cross-border risk rules: foreign country, spending surge, exotic currency'
  text: 'CB1: If transaction country ≠ issuing country AND user has no prior activity there → flag. CB2: ≥3 cross-border transactions in 24h across ≥2 currency zones AND total > €1,000 → escalate unless travel is verified. CB3: Currency not used in past 90 days or listed as exotic → increase risk score.'
  checkable: false
- clause_id: XBF-2
  title: 'Jurisdictional compliance: sanctions, FATF high-risk, offshore merchants'
  text: 'JC1: Transaction from/to OFAC/EU/UN sanctioned country → block and escalate. JC2: Originates from FATF high-risk jurisdiction → flag if amount > €200. JC3: Offshore merchant (e.g., BVI, Seychelles) AND user is retail → trigger enhanced due diligence.'
  checkable: false
- clause_id: XBF-3
  title: Identity and profile integrity (KYC) for cross-border transactions
  text: 'ID1: Missing key KYC info (e.g., verified ID/address) during cross-border transaction → hold. ID2: User declared residence ≠ frequent transaction location in restricted countries → flag for justification.'
  checkable: false
- clause_id: XBF-4
  title: 'Merchant and payment channel risks: gift cards, resale, unregulated crypto'
  text: 'MP1: Foreign online merchant in high-risk category (gift cards, resale, unregulated crypto) → apply risk multiplier. MP2: Repeated payments to foreign financial platforms not in regulated whitelist → trigger AML check.'
  checkable: false
- clause_id: XBF-5
  title: Cross-border thresholds over €10,000 and SEPA/EEA/US-Canada exemptions
  text: 'TH1: Any cross-border transaction > €10,000 → log and escalate per AML rules. TH2: Exempt low-risk cross-border activity within SEPA, EEA, or US/Canada if no other red flags.'
  checkable: false
- clause_id: XBF-6
  title: Cross-border fraud risk score bands and actions
  text: 'Risk scores per rule (e.g., 10–40 points). 0–30: Accept with logging. 31–60: Flag for compliance review. >60: Block, notify AML/compliance.'
  checkable: false
---
# Cross-Border Fraud Detection Policy (v1)

Effective from 2024-06-01.

**XBF-1 Cross-border risk rules: foreign country, spending surge, exotic currency.** CB1: If transaction country ≠ issuing country AND user has no prior activity there → flag. CB2: ≥3 cross-border transactions in 24h across ≥2 currency zones AND total > €1,000 → escalate unless travel is verified. CB3: Currency not used in past 90 days or listed as exotic → increase risk score.

**XBF-2 Jurisdictional compliance: sanctions, FATF high-risk, offshore merchants.** JC1: Transaction from/to OFAC/EU/UN sanctioned country → block and escalate. JC2: Originates from FATF high-risk jurisdiction → flag if amount > €200. JC3: Offshore merchant (e.g., BVI, Seychelles) AND user is retail → trigger enhanced due diligence.

**XBF-3 Identity and profile integrity (KYC) for cross-border transactions.** ID1: Missing key KYC info (e.g., verified ID/address) during cross-border transaction → hold. ID2: User declared residence ≠ frequent transaction location in restricted countries → flag for justification.

**XBF-4 Merchant and payment channel risks: gift cards, resale, unregulated crypto.** MP1: Foreign online merchant in high-risk category (gift cards, resale, unregulated crypto) → apply risk multiplier. MP2: Repeated payments to foreign financial platforms not in regulated whitelist → trigger AML check.

**XBF-5 Cross-border thresholds over €10,000 and SEPA/EEA/US-Canada exemptions.** TH1: Any cross-border transaction > €10,000 → log and escalate per AML rules. TH2: Exempt low-risk cross-border activity within SEPA, EEA, or US/Canada if no other red flags.

**XBF-6 Cross-border fraud risk score bands and actions.** Risk scores per rule (e.g., 10–40 points). 0–30: Accept with logging. 31–60: Flag for compliance review. >60: Block, notify AML/compliance.
