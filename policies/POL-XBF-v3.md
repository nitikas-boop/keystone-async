---
doc_type: policy_version
policy_id: POL-XBF
version: v3
title: Cross-Border Fraud Detection Policy
effective_from: 2026-01-15
source: data/external/policy-corpus/fraud-detection/Cross-Border-Transaction-Fraud-Detection-Compliance-Policy.txt
clauses:
- clause_id: XBF-1
  title: 'Cross-border risk rules: foreign country, spending surge, exotic currency'
  text: 'Rule 1.1: If a transaction is initiated from a country other than the card’s issuing country, and the user has not previously transacted in that region, assign a moderate risk score and verify the transaction context. Rule 1.2: If the user performs 3 or more cross-border transactions within 24 hours, across multiple currency zones, and the total spend exceeds €1,000, escalate for review unless travel was declared or supported by location data. Rule 1.3: If the transaction is in a rarely used or exotic currency (e.g., KZT, XOF), and it is not linked to known travel or business behavior, assign a high transaction risk score.'
  checkable: false
- clause_id: XBF-2
  title: 'Jurisdictional compliance: sanctions, FATF high-risk, offshore merchants'
  text: 'Rule 2.1: If the transaction involves a merchant or IP address in a jurisdiction under OFAC, EU, or UN sanctions, automatically block and escalate to compliance. Rule 2.2: If the transaction originates from or is routed through high-risk jurisdictions (as defined by FATF lists), flag for manual compliance review, especially if amount > €200. Rule 2.3: If the recipient is registered in a known offshore finance center (e.g., BVI, Seychelles, Cayman Islands), and the cardholder is a retail user with no business profile, trigger enhanced due diligence (EDD).'
  checkable: false
- clause_id: XBF-3
  title: Identity and profile integrity (KYC) for cross-border transactions
  text: 'Rule 3.1: If a cross-border transaction is attempted from a user missing key KYC fields (e.g., verified address, ID document), deny or hold the transaction and request re-verification. Rule 3.2: If a cardholder declared residence in Country A, but is transacting repeatedly from Country B (especially for high-value items), and Country B enforces stricter capital controls or reporting, flag and request justification.'
  checkable: false
- clause_id: XBF-4
  title: 'Merchant and payment channel risks: gift cards, resale, unregulated crypto'
  text: 'Rule 4.1: If the merchant is cross-border and belongs to a category often linked to laundering or synthetic ID fraud (e.g., digital goods resale, gift cards, shell e-commerce), apply a risk multiplier to the transaction score. Rule 4.2: If the cardholder sends recurring payments to an unlicensed financial service or crypto exchange registered abroad, and the platform is not in your regulated whitelist, flag for AML review.'
  checkable: false
- clause_id: XBF-5
  title: Cross-border thresholds over €10,000 and SEPA/EEA/US-Canada exemptions
  text: 'Rule 5.1: Any cross-border transaction over €10,000 must be logged and subject to reporting thresholds (e.g., under EU AMLD5 or FinCEN CTR rules). Rule 5.2: Exempt low-value cross-border transactions within the EEA, US-Canada, or SEPA zone from enhanced scrutiny, unless other risk signals apply.'
  checkable: false
- clause_id: XBF-6
  title: Cross-border fraud risk score bands and actions
  text: 'Assign each rule a weighted risk score based on regulatory sensitivity and historical fraud correlation. Composite score thresholds: 0–30: Accept with monitoring. 31–60: Flag for compliance review. >60: Block transaction and initiate EDD / SAR process. Use country-specific policies to override generic rules (e.g., tighter scrutiny for cards issued in high-fraud regions).'
  checkable: false
- clause_id: XBF-7
  title: Audit trail fields logged for flagged cross-border transactions
  text: 'Ensure every flagged cross-border transaction includes: Geo-IP location, Merchant jurisdiction, Currency conversion path, AML/KYC status of user, Sanctions or watchlist match flags.'
  checkable: false
---
# Cross-Border Fraud Detection Policy (v3)

Effective from 2026-01-15.

**XBF-1 Cross-border risk rules: foreign country, spending surge, exotic currency.** Rule 1.1: If a transaction is initiated from a country other than the card’s issuing country, and the user has not previously transacted in that region, assign a moderate risk score and verify the transaction context. Rule 1.2: If the user performs 3 or more cross-border transactions within 24 hours, across multiple currency zones, and the total spend exceeds €1,000, escalate for review unless travel was declared or supported by location data. Rule 1.3: If the transaction is in a rarely used or exotic currency (e.g., KZT, XOF), and it is not linked to known travel or business behavior, assign a high transaction risk score.

**XBF-2 Jurisdictional compliance: sanctions, FATF high-risk, offshore merchants.** Rule 2.1: If the transaction involves a merchant or IP address in a jurisdiction under OFAC, EU, or UN sanctions, automatically block and escalate to compliance. Rule 2.2: If the transaction originates from or is routed through high-risk jurisdictions (as defined by FATF lists), flag for manual compliance review, especially if amount > €200. Rule 2.3: If the recipient is registered in a known offshore finance center (e.g., BVI, Seychelles, Cayman Islands), and the cardholder is a retail user with no business profile, trigger enhanced due diligence (EDD).

**XBF-3 Identity and profile integrity (KYC) for cross-border transactions.** Rule 3.1: If a cross-border transaction is attempted from a user missing key KYC fields (e.g., verified address, ID document), deny or hold the transaction and request re-verification. Rule 3.2: If a cardholder declared residence in Country A, but is transacting repeatedly from Country B (especially for high-value items), and Country B enforces stricter capital controls or reporting, flag and request justification.

**XBF-4 Merchant and payment channel risks: gift cards, resale, unregulated crypto.** Rule 4.1: If the merchant is cross-border and belongs to a category often linked to laundering or synthetic ID fraud (e.g., digital goods resale, gift cards, shell e-commerce), apply a risk multiplier to the transaction score. Rule 4.2: If the cardholder sends recurring payments to an unlicensed financial service or crypto exchange registered abroad, and the platform is not in your regulated whitelist, flag for AML review.

**XBF-5 Cross-border thresholds over €10,000 and SEPA/EEA/US-Canada exemptions.** Rule 5.1: Any cross-border transaction over €10,000 must be logged and subject to reporting thresholds (e.g., under EU AMLD5 or FinCEN CTR rules). Rule 5.2: Exempt low-value cross-border transactions within the EEA, US-Canada, or SEPA zone from enhanced scrutiny, unless other risk signals apply.

**XBF-6 Cross-border fraud risk score bands and actions.** Assign each rule a weighted risk score based on regulatory sensitivity and historical fraud correlation. Composite score thresholds: 0–30: Accept with monitoring. 31–60: Flag for compliance review. >60: Block transaction and initiate EDD / SAR process. Use country-specific policies to override generic rules (e.g., tighter scrutiny for cards issued in high-fraud regions).

**XBF-7 Audit trail fields logged for flagged cross-border transactions.** Ensure every flagged cross-border transaction includes: Geo-IP location, Merchant jurisdiction, Currency conversion path, AML/KYC status of user, Sanctions or watchlist match flags.
