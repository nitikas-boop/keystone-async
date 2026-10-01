---
doc_type: policy_version
policy_id: POL-CRD
version: v1
title: Card Transaction Fraud Detection Policy
effective_from: 2025-03-01
source: data/external/policy-corpus/fraud-detection/text-rules-for-card-fraud-detection-1.txt
clauses:
- clause_id: CRD-1.1
  title: 'Card velocity: multi-tier temporal velocity'
  text: 'If a card is used: ≥ 3 times in under 1 minute, or ≥ 6 times in under 5 minutes, or ≥ 10 times in under 10 minutes, then assign increasing risk scores (10, 20, 30 respectively), and flag the card if the total exceeds 30.'
  checkable: false
- clause_id: CRD-1.2
  title: 'Card velocity: cross-merchant spike'
  text: If 3 or more transactions from the same card occur at distinct merchants within a 3-minute window, flag the transaction group for possible automation abuse or testing of stolen credentials.
  checkable: false
- clause_id: CRD-1.3
  title: Interleaved declines and approvals
  text: If more than 2 declined transactions occur within a 5-minute window, followed by an approved transaction, assign a high fraud suspicion score (35).
  checkable: false
- clause_id: CRD-2.1
  title: Improbable geolocation shift (card cloning)
  text: If two transactions from the same card originate from locations more than 500 km apart and occur within 30 minutes, flag the card for possible cloning.
  checkable: false
- clause_id: CRD-2.2
  title: Geofencing violation without travel notice
  text: If a transaction occurs outside the customer’s usual country or region without prior travel notice, and no recent login or transaction was registered from that region, increase the fraud score by 25.
  checkable: false
- clause_id: CRD-3.1
  title: Unusual transaction time deviation
  text: If the transaction occurs at an unusual time (±2 hours outside of the cardholder's typical transaction windows), and the transaction amount is greater than the daily average, increase fraud score by 15.
  checkable: false
- clause_id: CRD-3.2
  title: Unusual merchant category
  text: If the transaction is from a merchant in a category not seen in the last 90 days for the user, and the amount is ≥ €100, increase the fraud score by 10.
  checkable: false
- clause_id: CRD-4.1
  title: High amount deviation from the median
  text: If the transaction amount exceeds 5× the user’s median transaction amount, flag for review unless it's a recurring or previously whitelisted merchant.
  checkable: false
- clause_id: CRD-4.2
  title: New address or device for a high-value purchase
  text: If a transaction > €500 is made from a new device or new shipping address, and neither was verified, flag for manual review.
  checkable: false
- clause_id: CRD-5.1
  title: Device fingerprint mismatch
  text: If the current device fingerprint does not match any known trusted device, and the transaction amount exceeds €100, increase fraud score by 20.
  checkable: false
- clause_id: CRD-5.2
  title: VPN, proxy or TOR network indicators
  text: If the transaction is made from a VPN, anonymized proxy, or TOR, flag regardless of amount, unless this behavior is previously profiled and marked trusted.
  checkable: false
- clause_id: CRD-6.1
  title: Dormant card activation
  text: If a card was inactive for >30 days, and a transaction occurs above €200, flag unless preceded by a verified login or profile update.
  checkable: false
- clause_id: CRD-6.2
  title: Recent phishing or account takeover report
  text: If the cardholder reported phishing or account takeover in the past 7 days, auto-flag all new transactions for escalation.
  checkable: false
- clause_id: CRD-7
  title: Card fraud composite score bands and decay
  text: 'Each rule contributes to a composite fraud risk score, scaled between 0 and 100. Risk levels: Score 0–40: Low Risk – Approve transaction. Score 41–70: Medium Risk – Send for review. Score >70: High Risk – Block transaction, notify fraud team. Risk scores decay over time for ongoing monitoring (e.g., 10% per hour) if no further suspicious activity is observed.'
  checkable: false
---
# Card Transaction Fraud Detection Policy (v1)

Effective from 2025-03-01.

**CRD-1.1 Card velocity: multi-tier temporal velocity.** If a card is used: ≥ 3 times in under 1 minute, or ≥ 6 times in under 5 minutes, or ≥ 10 times in under 10 minutes, then assign increasing risk scores (10, 20, 30 respectively), and flag the card if the total exceeds 30.

**CRD-1.2 Card velocity: cross-merchant spike.** If 3 or more transactions from the same card occur at distinct merchants within a 3-minute window, flag the transaction group for possible automation abuse or testing of stolen credentials.

**CRD-1.3 Interleaved declines and approvals.** If more than 2 declined transactions occur within a 5-minute window, followed by an approved transaction, assign a high fraud suspicion score (35).

**CRD-2.1 Improbable geolocation shift (card cloning).** If two transactions from the same card originate from locations more than 500 km apart and occur within 30 minutes, flag the card for possible cloning.

**CRD-2.2 Geofencing violation without travel notice.** If a transaction occurs outside the customer’s usual country or region without prior travel notice, and no recent login or transaction was registered from that region, increase the fraud score by 25.

**CRD-3.1 Unusual transaction time deviation.** If the transaction occurs at an unusual time (±2 hours outside of the cardholder's typical transaction windows), and the transaction amount is greater than the daily average, increase fraud score by 15.

**CRD-3.2 Unusual merchant category.** If the transaction is from a merchant in a category not seen in the last 90 days for the user, and the amount is ≥ €100, increase the fraud score by 10.

**CRD-4.1 High amount deviation from the median.** If the transaction amount exceeds 5× the user’s median transaction amount, flag for review unless it's a recurring or previously whitelisted merchant.

**CRD-4.2 New address or device for a high-value purchase.** If a transaction > €500 is made from a new device or new shipping address, and neither was verified, flag for manual review.

**CRD-5.1 Device fingerprint mismatch.** If the current device fingerprint does not match any known trusted device, and the transaction amount exceeds €100, increase fraud score by 20.

**CRD-5.2 VPN, proxy or TOR network indicators.** If the transaction is made from a VPN, anonymized proxy, or TOR, flag regardless of amount, unless this behavior is previously profiled and marked trusted.

**CRD-6.1 Dormant card activation.** If a card was inactive for >30 days, and a transaction occurs above €200, flag unless preceded by a verified login or profile update.

**CRD-6.2 Recent phishing or account takeover report.** If the cardholder reported phishing or account takeover in the past 7 days, auto-flag all new transactions for escalation.

**CRD-7 Card fraud composite score bands and decay.** Each rule contributes to a composite fraud risk score, scaled between 0 and 100. Risk levels: Score 0–40: Low Risk – Approve transaction. Score 41–70: Medium Risk – Send for review. Score >70: High Risk – Block transaction, notify fraud team. Risk scores decay over time for ongoing monitoring (e.g., 10% per hour) if no further suspicious activity is observed.
