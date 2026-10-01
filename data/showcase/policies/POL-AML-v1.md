---
doc_type: policy_version
policy_id: POL-AML
version: v1
title: Policy for Automated Detection of Money Laundering Activities
effective_from: 2024-04-01
source: data/external/policy-corpus/banking/aml/anti_money_laundering_simple_detection.txt
clauses:
- clause_id: AML-1
  title: High-value transactions of 10,000 USD or more
  text: Flag any single transaction with an amount greater than or equal to 10,000 USD (or equivalent in any supported currency). Flag any set of transactions from the same customer where the cumulative amount in a 24-hour window is greater than or equal to 10,000 USD.
  checkable: false
- clause_id: AML-2
  title: Structuring (smurfing) patterns
  text: Monitor all transactions under 10,000 USD made by the same customer (or linked accounts) over any rolling 7-day period. If the cumulative sum of those transactions within the 7-day window is greater than or equal to 10,000 USD, flag the pattern. If such 7-day structuring patterns occur in three or more distinct rolling 7-day windows within a 30-day period, escalate the case.
  checkable: false
- clause_id: AML-3
  title: High-risk jurisdiction monitoring
  text: Maintain a list of jurisdictions classified as high-risk (e.g., based on FATF or internal risk scoring). Flag any transaction sent to or received from an account in a high-risk jurisdiction. Flag any customer with no prior cross-border activity who initiates a cross-border transaction with an amount greater than or equal to 5,000 USD.
  checkable: false
- clause_id: AML-4
  title: Dormant account reactivation
  text: Define a dormant account as one with no debit or credit activity for at least 180 consecutive days. If such an account receives a deposit greater than or equal to 5,000 USD, or initiates outbound transfers within 7 days after reactivation, flag the activity.
  checkable: false
- clause_id: AML-5
  title: Customer risk scoring
  text: 'Assign each customer a dynamic risk score between 0 and 1 based on: Customer industry (e.g., cash-intensive sectors), Geographic location, Volume and velocity of transactions, Incomplete or outdated KYC (Know Your Customer) documentation. Flag any transaction initiated by a customer whose risk score is greater than or equal to 0.8. Require manual review if the risk score is between 0.5 and 0.8 and the transaction exceeds 5,000 USD.'
  checkable: false
- clause_id: AML-6
  title: Rapid movement of funds
  text: Flag any account that receives a deposit greater than or equal to 10,000 USD and initiates outbound transfers of 90% or more of that amount within 48 hours.
  checkable: false
- clause_id: AML-7
  title: Repeated round-number transactions
  text: Flag any customer who executes three or more transactions involving round-number amounts (e.g., 5,000 / 9,900 / 10,000 / 20,000 USD) within a 7-day period.
  checkable: false
- clause_id: AML-8
  title: Circular or clustered transactions
  text: Identify clusters of accounts (3 or more) where funds are sent between them in a circular or repeating pattern within 72 hours. Flag if any such cluster completes two or more cycles of fund movement in a 30-day period.
  checkable: false
- clause_id: AML-9
  title: AML alert escalation and SAR cross-reference
  text: If any customer triggers three or more rules in this policy within a rolling 30-day period, escalate for compliance review. Automatically cross-reference flagged transactions with any entities or accounts listed in prior SARs (Suspicious Activity Reports). Escalate if a match is found.
  checkable: false
---
# Policy for Automated Detection of Money Laundering Activities (v1)

Effective from 2024-04-01.

**AML-1 High-value transactions of 10,000 USD or more.** Flag any single transaction with an amount greater than or equal to 10,000 USD (or equivalent in any supported currency). Flag any set of transactions from the same customer where the cumulative amount in a 24-hour window is greater than or equal to 10,000 USD.

**AML-2 Structuring (smurfing) patterns.** Monitor all transactions under 10,000 USD made by the same customer (or linked accounts) over any rolling 7-day period. If the cumulative sum of those transactions within the 7-day window is greater than or equal to 10,000 USD, flag the pattern. If such 7-day structuring patterns occur in three or more distinct rolling 7-day windows within a 30-day period, escalate the case.

**AML-3 High-risk jurisdiction monitoring.** Maintain a list of jurisdictions classified as high-risk (e.g., based on FATF or internal risk scoring). Flag any transaction sent to or received from an account in a high-risk jurisdiction. Flag any customer with no prior cross-border activity who initiates a cross-border transaction with an amount greater than or equal to 5,000 USD.

**AML-4 Dormant account reactivation.** Define a dormant account as one with no debit or credit activity for at least 180 consecutive days. If such an account receives a deposit greater than or equal to 5,000 USD, or initiates outbound transfers within 7 days after reactivation, flag the activity.

**AML-5 Customer risk scoring.** Assign each customer a dynamic risk score between 0 and 1 based on: Customer industry (e.g., cash-intensive sectors), Geographic location, Volume and velocity of transactions, Incomplete or outdated KYC (Know Your Customer) documentation. Flag any transaction initiated by a customer whose risk score is greater than or equal to 0.8. Require manual review if the risk score is between 0.5 and 0.8 and the transaction exceeds 5,000 USD.

**AML-6 Rapid movement of funds.** Flag any account that receives a deposit greater than or equal to 10,000 USD and initiates outbound transfers of 90% or more of that amount within 48 hours.

**AML-7 Repeated round-number transactions.** Flag any customer who executes three or more transactions involving round-number amounts (e.g., 5,000 / 9,900 / 10,000 / 20,000 USD) within a 7-day period.

**AML-8 Circular or clustered transactions.** Identify clusters of accounts (3 or more) where funds are sent between them in a circular or repeating pattern within 72 hours. Flag if any such cluster completes two or more cycles of fund movement in a 30-day period.

**AML-9 AML alert escalation and SAR cross-reference.** If any customer triggers three or more rules in this policy within a rolling 30-day period, escalate for compliance review. Automatically cross-reference flagged transactions with any entities or accounts listed in prior SARs (Suspicious Activity Reports). Escalate if a match is found.
