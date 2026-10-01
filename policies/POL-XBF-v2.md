---
doc_type: policy_version
policy_id: POL-XBF
version: v2
title: Cross-Border Fraud Detection Policy
effective_from: 2025-03-01
source: data/external/policy-corpus/fraud-detection/Cross-Border-Fraud-Detection-NL-Policy.txt
clauses:
- clause_id: XBF-1
  title: 'Cross-border risk rules: foreign country, spending surge, exotic currency'
  text: Flag any transaction made from a country that doesn’t match the card’s issuing country, unless the user has a history of transacting there. If a user makes three or more international transactions within 24 hours, across at least two different currencies, and spends over €1,000, review unless travel has been confirmed. Transactions in unusual or exotic currencies that the user hasn’t used before should raise a risk flag.
  checkable: false
- clause_id: XBF-2
  title: 'Jurisdictional compliance: sanctions, FATF high-risk, offshore merchants'
  text: Automatically block transactions linked to countries under international sanctions (e.g., OFAC, EU, UN lists). If a transaction originates from a country considered high-risk for money laundering, and the amount is over €200, flag it for review. Payments to offshore financial centers (like the Cayman Islands or Seychelles) by personal cardholders without business profiles should trigger extra due diligence.
  checkable: false
- clause_id: XBF-3
  title: Identity and profile integrity (KYC) for cross-border transactions
  text: Hold cross-border transactions if the user’s identity verification (e.g., ID or address) is incomplete. If a user claims residence in one country but repeatedly makes transactions from another—especially if that country has strict financial controls—ask for justification.
  checkable: false
- clause_id: XBF-4
  title: 'Merchant and payment channel risks: gift cards, resale, unregulated crypto'
  text: Be cautious with foreign merchants in high-risk categories (such as gift card sellers, resale platforms, or unregulated crypto services). These should increase the transaction’s risk score. If a user repeatedly sends money to unlicensed or unregulated financial platforms based abroad, flag the activity for anti-money laundering (AML) review.
  checkable: false
- clause_id: XBF-5
  title: Cross-border thresholds over €10,000 and SEPA/EEA/US-Canada exemptions
  text: All cross-border transactions over €10,000 must be reported and reviewed for regulatory compliance. Low-value international transactions within trusted regions (like SEPA, EEA, or between the US and Canada) can be allowed with less scrutiny—unless other risks are detected.
  checkable: false
- clause_id: XBF-6
  title: Cross-border fraud risk score bands and actions
  text: 'Each rule adds to a total fraud risk score. Low risk (0–30): Allow, but monitor. Medium risk (31–60): Flag for manual review. High risk (>60): Block and notify the compliance team.'
  checkable: false
---
# Cross-Border Fraud Detection Policy (v2)

Effective from 2025-03-01.

**XBF-1 Cross-border risk rules: foreign country, spending surge, exotic currency.** Flag any transaction made from a country that doesn’t match the card’s issuing country, unless the user has a history of transacting there. If a user makes three or more international transactions within 24 hours, across at least two different currencies, and spends over €1,000, review unless travel has been confirmed. Transactions in unusual or exotic currencies that the user hasn’t used before should raise a risk flag.

**XBF-2 Jurisdictional compliance: sanctions, FATF high-risk, offshore merchants.** Automatically block transactions linked to countries under international sanctions (e.g., OFAC, EU, UN lists). If a transaction originates from a country considered high-risk for money laundering, and the amount is over €200, flag it for review. Payments to offshore financial centers (like the Cayman Islands or Seychelles) by personal cardholders without business profiles should trigger extra due diligence.

**XBF-3 Identity and profile integrity (KYC) for cross-border transactions.** Hold cross-border transactions if the user’s identity verification (e.g., ID or address) is incomplete. If a user claims residence in one country but repeatedly makes transactions from another—especially if that country has strict financial controls—ask for justification.

**XBF-4 Merchant and payment channel risks: gift cards, resale, unregulated crypto.** Be cautious with foreign merchants in high-risk categories (such as gift card sellers, resale platforms, or unregulated crypto services). These should increase the transaction’s risk score. If a user repeatedly sends money to unlicensed or unregulated financial platforms based abroad, flag the activity for anti-money laundering (AML) review.

**XBF-5 Cross-border thresholds over €10,000 and SEPA/EEA/US-Canada exemptions.** All cross-border transactions over €10,000 must be reported and reviewed for regulatory compliance. Low-value international transactions within trusted regions (like SEPA, EEA, or between the US and Canada) can be allowed with less scrutiny—unless other risks are detected.

**XBF-6 Cross-border fraud risk score bands and actions.** Each rule adds to a total fraud risk score. Low risk (0–30): Allow, but monitor. Medium risk (31–60): Flag for manual review. High risk (>60): Block and notify the compliance team.
