"""DecisionsDev Policy-Corpus (Apache-2.0) -> Keystone policy_version documents in data/showcase/policies/.
Clause text is verbatim from the source; only the split into clauses, the clause titles (retrieval matches on them)
and the effective dates are ours. Needs the corpus in data/external/policy-corpus (see data/external/fetch_live.py).

    python scripts/build_policy_corpus.py
"""
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
SRC = 'data/external/policy-corpus/'
OUT = ROOT / 'data' / 'showcase' / 'policies'

P = []  # (policy_id, version, title, effective_from, source file, [(clause_id, title, text)])

P.append(('POL-TOF', 'v1', 'Acme Corp Time Off Policy', '2024-01-01', 'human-resources/acme_time_off.txt', [
    ('TOF-1', 'Paid holidays: twelve per year',
     'Acme Corp observes twelve paid U.S. holidays each year for eligible employees. This includes eight fixed holidays designated by Acme Corp and four personal choice holidays that eligible employees may use.'),
    ('TOF-2', 'Fixed holidays list',
     'The eight fixed holidays designated by Acme Corp in the U.S. are: New Year’s Day, Martin Luther King Jr. Day, Memorial Day, Independence Day, Labor Day, Thanksgiving Day, the Day after Thanksgiving and Christmas Day.'),
    ('TOF-3', 'Personal choice holidays',
     'In addition to the nationally observed holidays, regular full-time employees earn up to four personal choice holidays. With management approval, employees can take these days to observe additional holidays as they choose. Supplemental employees cannot earn personal choice holidays.'),
    ('TOF-4', 'Vacation weeks by years of service',
     'Acme Corp offers a vacation plan to all regular employees based on your years of service: Less than 10 years of service = 3 weeks per year; 10 or more years of service = 4 weeks per year; Hired prior to January 1, 2004 with 20 or more years of service = 5 weeks per year.'),
    ('TOF-5', 'Vacation scheduling and manager approval',
     'With the approval of your manager, you can take vacation at any time during the year in half-days, days or weeks, based on business needs and personal preferences.'),
    ('TOF-6', 'Personal sick time (PST) allowance and carryover',
     'Acme Corp offers a minimum of 48 hours (six days) of annual paid sick time (pro-rated for new hires). You can’t carry over unused PST to the following calendar year (unless applicable law requires carryover). You will never receive payout for unused sick time.'),
]))

P.append(('POL-DSC', 'v1', 'Acme Corp Discount Approval Policy', '2025-01-01', 'marketing/discount/discount_approval.txt', [
    ('DSC-0', 'Scope of the discount approval policy',
     'This policy governs all discount approvals for customer deals submitted by the sales team. It applies to Sales Representatives, Sales Managers, and Finance Officers. Policy Owner: Sales Operations. Reviewed semi-annually.'),
    ('DSC-1', 'Discount limits by customer tier',
     'Sales Representatives may approve discounts based on the customer’s classification in the CRM system. Customers are grouped into three tiers: Tier 1 (Enterprise), Tier 2 (SMB), and Tier 3 (Startups). The maximum allowable discount without further approval is 20% for Tier 1 customers, 15% for Tier 2 customers, and 10% for Tier 3 customers.'),
    ('DSC-2', 'Deal size restrictions on discounts',
     'For deals under $5,000, the representative may approve discounts up to their tier-based maximum. For deals between $5,000 and $25,000, any discount exceeding 10% requires approval from a Sales Manager, regardless of the customer tier. For deals over $25,000, Finance approval is required for any discount above 5%.'),
    ('DSC-3', 'Minimum gross margin of 30%',
     'No discount shall be granted if the resulting gross margin falls below 30%, unless explicitly approved by the Vice President of Sales. The gross margin must be computed using the CPQ tool’s automatic calculation, factoring in current pricing and cost structures.'),
    ('DSC-4', 'Discount approval workflow: Sales Manager and Finance',
     'Sales Managers may approve discounts up to 25%, provided the gross margin remains at or above 30%. Any discount above 25%, or any case where the gross margin drops below 35%, must also be approved by a Finance Officer. Additionally, if the deal includes a bundled offer involving hardware, Finance must co-approve regardless of margin.'),
    ('DSC-5', 'Automatic discount approval criteria',
     'A discount may be automatically approved without human intervention if all the following conditions are met: the discount is within the representative’s tier limit, the customer has no overdue invoices in the past 12 months, the quote uses the standard pricing template, and no custom contract terms are included.'),
    ('DSC-6', 'Discount exceptions and the Deal Desk Committee',
     'Any discount request that does not meet the criteria outlined in this policy must be submitted as an exception using the Discount Justification Form available in Salesforce. All exceptions are reviewed on a weekly basis by the Deal Desk Committee, which may grant or deny approval based on strategic or financial considerations.'),
]))

P.append(('POL-PAY', 'v1', 'AetherSky Airways Pilot Compensation Policy', '2025-02-01',
          'human-resources/compensation/aethersky-airways-pilot-compensation-policy.txt', [
    ('PAY-2.1', 'Pilot base pay and guaranteed flight hours',
     'Pilot compensation is calculated primarily on a per-flight-hour basis. Pilots are paid based on their rank (First Officer or Captain) and the type of aircraft operated (narrow-body or wide-body). The base hourly rate reflects qualifications, operational responsibility, and market benchmarks. A minimum of 75 flight hours per month is guaranteed for all active pilots. Compensation is capped at 100 flight hours per month and 1,000 hours annually. In addition to flight hours, compensation is provided for ground duty and mandatory training. Ground standby is compensated at a flat daily rate, and training sessions (including simulator time, recurrent checks, and safety briefings) are compensated at a separate daily rate.'),
    ('PAY-2.2', 'Pilot signing, performance and retention bonuses',
     'Newly hired pilots are eligible for a one-time signing bonus. First Officers receive $10,000, while Direct-Entry Captains receive $20,000, payable upon completion of probationary training. Annual performance bonuses of up to 10% of total annual earnings are awarded based on key performance indicators such as safety record, punctuality, professional conduct, and feedback from flight operations. Additionally, a service-based retention bonus of $5,000 is issued for every three consecutive years of service.'),
    ('PAY-3', 'Pilot per diem and travel allowances',
     'Pilots are entitled to per diem payments to cover meals and incidental expenses while on duty away from their home base. The domestic per diem rate is set at $3.25 per hour and international assignments are compensated at $5.00 per hour. These rates are applied continuously from sign-in to release at base. Overnight accommodation and ground transportation are provided and arranged by the airline.'),
    ('PAY-4', 'Holiday, short-notice and reserve callout premiums',
     'Flight assignments on designated holidays are compensated at 1.5 times the regular hourly rate. Short-notice assignments issued within 48 hours of departure qualify for a premium payment of $250 per flight leg, in addition to the standard hourly compensation. Reserve callouts are compensated with a flat fee of $75, regardless of flight assignment, and are followed by regular hourly pay if flight duty is performed.'),
    ('PAY-5', 'Pilot vacation, sick days and emergency leave',
     'Pilots accrue 15 days of paid vacation annually, with accrual increasing with seniority. In addition, each pilot is entitled to 10 paid sick days per calendar year. Emergency unpaid leave of up to five days may be granted under exceptional personal circumstances, with the option to apply banked paid time off toward such leave. All leave requests are subject to a bidding and seniority-based approval system.'),
    ('PAY-6', 'Pilot health, 401(k), life insurance and travel benefits',
     'AetherSky Airways provides comprehensive health benefits, including medical, dental, and vision insurance. The company contributes 90% of the premiums. Pilots are also enrolled in a 401(k) retirement plan with a 6% employer match. Life insurance equivalent to twice the base annual salary is provided at no cost. The airline offers mental health support programs, including fatigue management consultations and confidential counseling. Travel benefits are extended to pilots and their immediate family members, including unlimited standby travel on all AetherSky flights and partner airline discounts.'),
    ('PAY-7', 'Pilot raises and promotion to Captain',
     'Pilot compensation increases annually based on seniority, performance, and role. Annual raises range from 2% to 5%. First Officers are eligible for promotion to Captain after completing a minimum of three years of service and 2,000 logged flight hours, subject to performance evaluations and operational needs. Upon promotion, pilots are automatically transitioned to the appropriate compensation tier.'),
    ('PAY-8', 'Pilot compensation oversight and audit',
     'All aspects of pilot compensation are subject to regular review and audit. The Pilot Compensation Oversight Committee conducts annual audits to ensure transparency and fairness. All changes in pay structure, benefits, or bonuses are communicated in writing and must be acknowledged electronically by the pilot.'),
]))

P.append(('POL-AML', 'v1', 'Policy for Automated Detection of Money Laundering Activities', '2024-04-01',
          'banking/aml/anti_money_laundering_simple_detection.txt', [
    ('AML-1', 'High-value transactions of 10,000 USD or more',
     'Flag any single transaction with an amount greater than or equal to 10,000 USD (or equivalent in any supported currency). Flag any set of transactions from the same customer where the cumulative amount in a 24-hour window is greater than or equal to 10,000 USD.'),
    ('AML-2', 'Structuring (smurfing) patterns',
     'Monitor all transactions under 10,000 USD made by the same customer (or linked accounts) over any rolling 7-day period. If the cumulative sum of those transactions within the 7-day window is greater than or equal to 10,000 USD, flag the pattern. If such 7-day structuring patterns occur in three or more distinct rolling 7-day windows within a 30-day period, escalate the case.'),
    ('AML-3', 'High-risk jurisdiction monitoring',
     'Maintain a list of jurisdictions classified as high-risk (e.g., based on FATF or internal risk scoring). Flag any transaction sent to or received from an account in a high-risk jurisdiction. Flag any customer with no prior cross-border activity who initiates a cross-border transaction with an amount greater than or equal to 5,000 USD.'),
    ('AML-4', 'Dormant account reactivation',
     'Define a dormant account as one with no debit or credit activity for at least 180 consecutive days. If such an account receives a deposit greater than or equal to 5,000 USD, or initiates outbound transfers within 7 days after reactivation, flag the activity.'),
    ('AML-5', 'Customer risk scoring',
     'Assign each customer a dynamic risk score between 0 and 1 based on: Customer industry (e.g., cash-intensive sectors), Geographic location, Volume and velocity of transactions, Incomplete or outdated KYC (Know Your Customer) documentation. Flag any transaction initiated by a customer whose risk score is greater than or equal to 0.8. Require manual review if the risk score is between 0.5 and 0.8 and the transaction exceeds 5,000 USD.'),
    ('AML-6', 'Rapid movement of funds',
     'Flag any account that receives a deposit greater than or equal to 10,000 USD and initiates outbound transfers of 90% or more of that amount within 48 hours.'),
    ('AML-7', 'Repeated round-number transactions',
     'Flag any customer who executes three or more transactions involving round-number amounts (e.g., 5,000 / 9,900 / 10,000 / 20,000 USD) within a 7-day period.'),
    ('AML-8', 'Circular or clustered transactions',
     'Identify clusters of accounts (3 or more) where funds are sent between them in a circular or repeating pattern within 72 hours. Flag if any such cluster completes two or more cycles of fund movement in a 30-day period.'),
    ('AML-9', 'AML alert escalation and SAR cross-reference',
     'If any customer triggers three or more rules in this policy within a rolling 30-day period, escalate for compliance review. Automatically cross-reference flagged transactions with any entities or accounts listed in prior SARs (Suspicious Activity Reports). Escalate if a match is found.'),
]))

P.append(('POL-CDD', 'v1', 'Customer Due Diligence and Enhanced Due Diligence Policy (CDD/EDD)', '2025-07-01',
          'banking/aml/cdd_edd.txt', [
    ('CDD-0', 'Scope of CDD/EDD: crypto-assets, high-risk countries, cash, PEPs',
     'This policy applies to all transactions and business relationships managed by the institution, including operations involving crypto-assets, high-risk third countries, cash payments, and politically exposed persons (PEPs). It ensures compliance with AMLD6 and AMLR obligations across the EU.'),
    ('CDD-1', 'When to apply customer due diligence (CDD)',
     'CDD must be performed before executing a transaction or establishing a business relationship under the following circumstances: When a customer initiates a transaction that exceeds legally defined thresholds. When the customer is not previously known to the institution or lacks sufficient identification data. For any crypto-asset transaction equal to or exceeding €1,000. When there is suspicion of money laundering or terrorist financing, regardless of the transaction amount. Whenever a business relationship is initiated, including onboarding of individual or corporate clients.'),
    ('CDD-2', 'When to apply enhanced due diligence (EDD): PEPs, high-risk countries, €50 million wealth',
     'EDD procedures must be applied in addition to standard CDD when any of the following conditions are met: The customer is a politically exposed person (PEP) or closely associated with a PEP. The transaction involves a country classified as high-risk by the EU or the FATF. The customer qualifies as a high-net-worth individual, with wealth equal to or exceeding €50 million. The transaction involves the use of auto-hosted crypto wallets or a correspondent relationship between crypto-asset service providers across borders. In these cases, the institution must collect and document the source of funds and wealth, conduct ongoing monitoring, and obtain senior management approval before proceeding.'),
    ('CDD-3', 'Identity verification for individuals, legal entities, trusts and crypto',
     'For individuals, the institution must verify the full name, date of birth, nationality, residential address, official government-issued ID, and a recent photograph. For legal entities, it must verify the registered legal name, company registration number, address, legal structure, and the identity of the ultimate beneficial owners (UBOs). For trusts or fiduciary arrangements, the trust deed must be obtained along with identification details of the trustees, settlors, and beneficiaries, including the ownership and control structure. For crypto-asset transactions equal to or exceeding €1,000, the origin and destination wallet addresses must be recorded, and identity verification must be completed. The purpose of the transaction must also be captured.'),
    ('CDD-4', 'Due diligence timing, five-year record retention and refresh cycle',
     'Identity verification and all CDD or EDD checks must be completed before account opening or transaction execution. All records collected as part of due diligence must be securely retained for a minimum of five years after the end of the business relationship or the execution of the occasional transaction. Due diligence information must be refreshed: At least every 12 months for high-risk customers. At least every 36 months for standard-risk customers. Immediately when a red flag arises or if there is a significant change in the customer’s circumstances or ownership.'),
    ('CDD-5', 'Automated compliance actions and beneficial ownership discrepancy reports',
     'The compliance system must automatically block or delay transactions when regulatory thresholds are exceeded until CDD is complete. If a customer matches a PEP list or a financial sanctions list, the system must initiate enhanced due diligence protocols and notify the compliance officer. For transactions involving high-risk countries, the system must enforce stricter monitoring and additional documentation requirements. If a customer profile is incomplete or invalid, the system must prevent onboarding or transaction processing until all required data is collected and verified. When discrepancies are detected between the internal beneficial ownership data and the official registry, a discrepancy report must be submitted to the competent authority within 14 calendar days. The report must include evidence of the divergence and a proposed correction if available.'),
    ('CDD-6', 'CDD/EDD exceptions and escalation to the FIU',
     'Any exception to CDD or EDD requirements must be approved by a designated senior compliance officer. No employee may override these controls without formal authorization. If CDD cannot be completed or if there is reasonable suspicion of money laundering or terrorist financing, the case must be escalated to the institution’s Financial Intelligence Unit (FIU) for further investigation and potential filing of a Suspicious Transaction Report (STR).'),
]))

# Three source documents state the same cross-border fraud policy in increasing detail: kept as versions v1 -> v3,
# so the as-of slider has a real policy history to move through.
XBF = 'Cross-Border Fraud Detection Policy'
P.append(('POL-XBF', 'v1', XBF, '2024-06-01', 'fraud-detection/compact.txt', [
    ('XBF-1', 'Cross-border risk rules: foreign country, spending surge, exotic currency',
     'CB1: If transaction country ≠ issuing country AND user has no prior activity there → flag. CB2: ≥3 cross-border transactions in 24h across ≥2 currency zones AND total > €1,000 → escalate unless travel is verified. CB3: Currency not used in past 90 days or listed as exotic → increase risk score.'),
    ('XBF-2', 'Jurisdictional compliance: sanctions, FATF high-risk, offshore merchants',
     'JC1: Transaction from/to OFAC/EU/UN sanctioned country → block and escalate. JC2: Originates from FATF high-risk jurisdiction → flag if amount > €200. JC3: Offshore merchant (e.g., BVI, Seychelles) AND user is retail → trigger enhanced due diligence.'),
    ('XBF-3', 'Identity and profile integrity (KYC) for cross-border transactions',
     'ID1: Missing key KYC info (e.g., verified ID/address) during cross-border transaction → hold. ID2: User declared residence ≠ frequent transaction location in restricted countries → flag for justification.'),
    ('XBF-4', 'Merchant and payment channel risks: gift cards, resale, unregulated crypto',
     'MP1: Foreign online merchant in high-risk category (gift cards, resale, unregulated crypto) → apply risk multiplier. MP2: Repeated payments to foreign financial platforms not in regulated whitelist → trigger AML check.'),
    ('XBF-5', 'Cross-border thresholds over €10,000 and SEPA/EEA/US-Canada exemptions',
     'TH1: Any cross-border transaction > €10,000 → log and escalate per AML rules. TH2: Exempt low-risk cross-border activity within SEPA, EEA, or US/Canada if no other red flags.'),
    ('XBF-6', 'Cross-border fraud risk score bands and actions',
     'Risk scores per rule (e.g., 10–40 points). 0–30: Accept with logging. 31–60: Flag for compliance review. >60: Block, notify AML/compliance.'),
]))
P.append(('POL-XBF', 'v2', XBF, '2025-03-01', 'fraud-detection/Cross-Border-Fraud-Detection-NL-Policy.txt', [
    ('XBF-1', 'Cross-border risk rules: foreign country, spending surge, exotic currency',
     'Flag any transaction made from a country that doesn’t match the card’s issuing country, unless the user has a history of transacting there. If a user makes three or more international transactions within 24 hours, across at least two different currencies, and spends over €1,000, review unless travel has been confirmed. Transactions in unusual or exotic currencies that the user hasn’t used before should raise a risk flag.'),
    ('XBF-2', 'Jurisdictional compliance: sanctions, FATF high-risk, offshore merchants',
     'Automatically block transactions linked to countries under international sanctions (e.g., OFAC, EU, UN lists). If a transaction originates from a country considered high-risk for money laundering, and the amount is over €200, flag it for review. Payments to offshore financial centers (like the Cayman Islands or Seychelles) by personal cardholders without business profiles should trigger extra due diligence.'),
    ('XBF-3', 'Identity and profile integrity (KYC) for cross-border transactions',
     'Hold cross-border transactions if the user’s identity verification (e.g., ID or address) is incomplete. If a user claims residence in one country but repeatedly makes transactions from another—especially if that country has strict financial controls—ask for justification.'),
    ('XBF-4', 'Merchant and payment channel risks: gift cards, resale, unregulated crypto',
     'Be cautious with foreign merchants in high-risk categories (such as gift card sellers, resale platforms, or unregulated crypto services). These should increase the transaction’s risk score. If a user repeatedly sends money to unlicensed or unregulated financial platforms based abroad, flag the activity for anti-money laundering (AML) review.'),
    ('XBF-5', 'Cross-border thresholds over €10,000 and SEPA/EEA/US-Canada exemptions',
     'All cross-border transactions over €10,000 must be reported and reviewed for regulatory compliance. Low-value international transactions within trusted regions (like SEPA, EEA, or between the US and Canada) can be allowed with less scrutiny—unless other risks are detected.'),
    ('XBF-6', 'Cross-border fraud risk score bands and actions',
     'Each rule adds to a total fraud risk score. Low risk (0–30): Allow, but monitor. Medium risk (31–60): Flag for manual review. High risk (>60): Block and notify the compliance team.'),
]))
P.append(('POL-XBF', 'v3', XBF, '2026-01-15', 'fraud-detection/Cross-Border-Transaction-Fraud-Detection-Compliance-Policy.txt', [
    ('XBF-1', 'Cross-border risk rules: foreign country, spending surge, exotic currency',
     'Rule 1.1: If a transaction is initiated from a country other than the card’s issuing country, and the user has not previously transacted in that region, assign a moderate risk score and verify the transaction context. Rule 1.2: If the user performs 3 or more cross-border transactions within 24 hours, across multiple currency zones, and the total spend exceeds €1,000, escalate for review unless travel was declared or supported by location data. Rule 1.3: If the transaction is in a rarely used or exotic currency (e.g., KZT, XOF), and it is not linked to known travel or business behavior, assign a high transaction risk score.'),
    ('XBF-2', 'Jurisdictional compliance: sanctions, FATF high-risk, offshore merchants',
     'Rule 2.1: If the transaction involves a merchant or IP address in a jurisdiction under OFAC, EU, or UN sanctions, automatically block and escalate to compliance. Rule 2.2: If the transaction originates from or is routed through high-risk jurisdictions (as defined by FATF lists), flag for manual compliance review, especially if amount > €200. Rule 2.3: If the recipient is registered in a known offshore finance center (e.g., BVI, Seychelles, Cayman Islands), and the cardholder is a retail user with no business profile, trigger enhanced due diligence (EDD).'),
    ('XBF-3', 'Identity and profile integrity (KYC) for cross-border transactions',
     'Rule 3.1: If a cross-border transaction is attempted from a user missing key KYC fields (e.g., verified address, ID document), deny or hold the transaction and request re-verification. Rule 3.2: If a cardholder declared residence in Country A, but is transacting repeatedly from Country B (especially for high-value items), and Country B enforces stricter capital controls or reporting, flag and request justification.'),
    ('XBF-4', 'Merchant and payment channel risks: gift cards, resale, unregulated crypto',
     'Rule 4.1: If the merchant is cross-border and belongs to a category often linked to laundering or synthetic ID fraud (e.g., digital goods resale, gift cards, shell e-commerce), apply a risk multiplier to the transaction score. Rule 4.2: If the cardholder sends recurring payments to an unlicensed financial service or crypto exchange registered abroad, and the platform is not in your regulated whitelist, flag for AML review.'),
    ('XBF-5', 'Cross-border thresholds over €10,000 and SEPA/EEA/US-Canada exemptions',
     'Rule 5.1: Any cross-border transaction over €10,000 must be logged and subject to reporting thresholds (e.g., under EU AMLD5 or FinCEN CTR rules). Rule 5.2: Exempt low-value cross-border transactions within the EEA, US-Canada, or SEPA zone from enhanced scrutiny, unless other risk signals apply.'),
    ('XBF-6', 'Cross-border fraud risk score bands and actions',
     'Assign each rule a weighted risk score based on regulatory sensitivity and historical fraud correlation. Composite score thresholds: 0–30: Accept with monitoring. 31–60: Flag for compliance review. >60: Block transaction and initiate EDD / SAR process. Use country-specific policies to override generic rules (e.g., tighter scrutiny for cards issued in high-fraud regions).'),
    ('XBF-7', 'Audit trail fields logged for flagged cross-border transactions',
     'Ensure every flagged cross-border transaction includes: Geo-IP location, Merchant jurisdiction, Currency conversion path, AML/KYC status of user, Sanctions or watchlist match flags.'),
]))

P.append(('POL-CRD', 'v1', 'Card Transaction Fraud Detection Policy', '2025-03-01',
          'fraud-detection/text-rules-for-card-fraud-detection-1.txt', [
    ('CRD-1.1', 'Card velocity: multi-tier temporal velocity',
     'If a card is used: ≥ 3 times in under 1 minute, or ≥ 6 times in under 5 minutes, or ≥ 10 times in under 10 minutes, then assign increasing risk scores (10, 20, 30 respectively), and flag the card if the total exceeds 30.'),
    ('CRD-1.2', 'Card velocity: cross-merchant spike',
     'If 3 or more transactions from the same card occur at distinct merchants within a 3-minute window, flag the transaction group for possible automation abuse or testing of stolen credentials.'),
    ('CRD-1.3', 'Interleaved declines and approvals',
     'If more than 2 declined transactions occur within a 5-minute window, followed by an approved transaction, assign a high fraud suspicion score (35).'),
    ('CRD-2.1', 'Improbable geolocation shift (card cloning)',
     'If two transactions from the same card originate from locations more than 500 km apart and occur within 30 minutes, flag the card for possible cloning.'),
    ('CRD-2.2', 'Geofencing violation without travel notice',
     'If a transaction occurs outside the customer’s usual country or region without prior travel notice, and no recent login or transaction was registered from that region, increase the fraud score by 25.'),
    ('CRD-3.1', 'Unusual transaction time deviation',
     "If the transaction occurs at an unusual time (±2 hours outside of the cardholder's typical transaction windows), and the transaction amount is greater than the daily average, increase fraud score by 15."),
    ('CRD-3.2', 'Unusual merchant category',
     'If the transaction is from a merchant in a category not seen in the last 90 days for the user, and the amount is ≥ €100, increase the fraud score by 10.'),
    ('CRD-4.1', 'High amount deviation from the median',
     "If the transaction amount exceeds 5× the user’s median transaction amount, flag for review unless it's a recurring or previously whitelisted merchant."),
    ('CRD-4.2', 'New address or device for a high-value purchase',
     'If a transaction > €500 is made from a new device or new shipping address, and neither was verified, flag for manual review.'),
    ('CRD-5.1', 'Device fingerprint mismatch',
     'If the current device fingerprint does not match any known trusted device, and the transaction amount exceeds €100, increase fraud score by 20.'),
    ('CRD-5.2', 'VPN, proxy or TOR network indicators',
     'If the transaction is made from a VPN, anonymized proxy, or TOR, flag regardless of amount, unless this behavior is previously profiled and marked trusted.'),
    ('CRD-6.1', 'Dormant card activation',
     'If a card was inactive for >30 days, and a transaction occurs above €200, flag unless preceded by a verified login or profile update.'),
    ('CRD-6.2', 'Recent phishing or account takeover report',
     'If the cardholder reported phishing or account takeover in the past 7 days, auto-flag all new transactions for escalation.'),
    ('CRD-7', 'Card fraud composite score bands and decay',
     'Each rule contributes to a composite fraud risk score, scaled between 0 and 100. Risk levels: Score 0–40: Low Risk – Approve transaction. Score 41–70: Medium Risk – Send for review. Score >70: High Risk – Block transaction, notify fraud team. Risk scores decay over time for ongoing monitoring (e.g., 10% per hour) if no further suspicious activity is observed.'),
]))

P.append(('POL-LNU', 'v1', 'Loan Approval Policy (US)', '2024-09-01', 'loan/basic_loan_approval_us.txt', [
    ('LNU-1', 'Loan eligibility: age, US residency and credit score 600',
     'Applicants must be at least 18 years old. Must be a resident or citizen of the United States. Minimum credit score of 600. Applicants with credit scores below this threshold may be rejected or offered alternative loan terms (e.g., higher interest rates or co-signer requirements).'),
    ('LNU-2', 'Loan eligibility: income and employment',
     'Minimum annual income of $30,000. Proof of income (pay stubs, tax returns, or bank statements) must be provided. Applicants must have stable employment or a reliable source of income. Self-employed individuals must provide at least 2 years of financial records.'),
    ('LNU-3', 'Maximum debt-to-income ratio (DTI) of 40%',
     'The maximum allowable DTI is 40%. (DTI is calculated by dividing total monthly debt payments by gross monthly income.)'),
    ('LNU-4', 'Loan amount range $5,000 to $50,000',
     'The loan amount requested must be within a range of $5,000 to $50,000. Loan amounts exceeding the maximum limit will be subject to additional approval.'),
    ('LNU-5', 'Loan application, credit check and review process',
     "Applicants must complete an online or in-person loan application form. All required documentation (proof of identity, income, and credit history) must be submitted with the application. A credit check will be conducted to assess the applicant's creditworthiness. Soft inquiries for pre-approvals and hard inquiries for final approval will be performed. The application will be reviewed by the loan officer or automated loan approval system. Applicants who do not meet the criteria will receive a notification stating the reason(s) for rejection and any corrective actions that may improve future applications."),
    ('LNU-6', 'Loan interest rates, repayment period, late payment and prepayment',
     'Interest rates are determined based on the applicant’s credit score and the loan amount. Rates typically range from 5% to 15% APR (Annual Percentage Rate). Standard loan repayment terms range from 12 to 60 months. Late payments will incur penalties of $25 or 5% of the monthly payment, whichever is greater. Loans may be repaid early without penalties unless otherwise specified in the terms.'),
    ('LNU-7', 'Loan co-signers and manual review by a senior loan officer',
     'If the applicant does not meet the credit score or income criteria, they may apply with a co-signer who meets the necessary qualifications. In cases where the applicant’s situation is not clearly addressed by the criteria, a manual review by a senior loan officer may be conducted.'),
]))

P.append(('POL-LNP', 'v1', 'Simple Personal Loan Approval Policy', '2025-05-01', 'loan/simple_loan/simple_loan.txt', [
    ('LNP-1', 'Personal loan eligibility criteria',
     'An applicant is eligible if all the following conditions are met: Age: Must be between 21 and 65 years old. Employment Status: Must be employed (full-time or part-time) or self-employed for at least 12 months. Monthly Income: Must have a minimum monthly income of $2,000. Credit Score: Must have a minimum credit score of 650. Debt-to-Income (DTI) Ratio: DTI must be less than or equal to 40%. Loan Amount Requested: Must not exceed 10 times the applicant’s monthly income.'),
    ('LNP-2', 'Personal loan auto-approval: credit score 700 and DTI 30%',
     'Auto-Approval if all following conditions are met: All eligibility criteria are met. Credit score is 700 or higher. DTI is 30% or lower.'),
    ('LNP-3', 'Personal loan auto-rejection',
     'Auto-Rejection if: Credit score is below 600, or DTI is above 50%, or Applicant is unemployed or employed less than 12 months.'),
    ('LNP-4', 'Personal loan manual review',
     'Manual Review Required if eligibility criteria are met: Credit score is between 600–649, or DTI is between 41–50%, or Income verification is missing or ambiguous.'),
    ('LNP-5', 'Personal loan income verification, terms and interest rates',
     'Income Verification: Must be from recent pay slips, tax return, or bank statements. Loan Term Options: 12, 24, 36, or 48 months. Interest Rates are risk-based, tied to credit score bands.'),
]))

P.append(('POL-UWR', 'v1', 'Underwriting Eligibility for Basic Insurance Coverage', '2025-05-01', 'loan/simple_loan/simple_loan_2.txt', [
    ('UWR-0', 'Underwriting decision owner and frequency',
     'Business Function: Insurance Underwriting. Decision Owner: Underwriting Team. Decision Frequency: Real-time (triggered during application submission).'),
    ('UWR-1', 'Basic coverage age range 18 to 65', 'Applicant must be between 18 and 65 years old.'),
    ('UWR-2', 'Basic coverage limit $250,000', 'Requested coverage must not exceed $250,000.'),
    ('UWR-3', 'Basic coverage health status: no pre-existing conditions', 'Applicant must not have pre-existing conditions.'),
    ('UWR-4', 'Basic coverage employment status', 'Applicant must be currently employed.'),
]))

P.append(('POL-CAR', 'v1', 'Car Insurance Eligibility Policy', '2024-09-01', 'insurance/basic_eligibility_car_insurance.txt', [
    ('CAR-1', 'Car insurance applicant age requirements',
     'The primary policyholder must be at least 18 years old. Drivers under 18 must have a parent or guardian as the primary policyholder. Drivers over the age of 75 may require additional medical assessments or driving tests.'),
    ('CAR-2', 'Valid driver’s license',
     'All drivers listed on the policy must hold a valid driver’s license for the vehicle class being insured. Licenses must be current, not expired, suspended, or revoked. International drivers may need to provide additional documentation or proof of driving history.'),
    ('CAR-3', 'Vehicle eligibility: registration, personal use, age over 20 years',
     'The vehicle must be registered in the name of the applicant or an immediate family member. The vehicle must be used primarily for personal use (commuting, leisure). Commercial use may require a different type of policy. The vehicle must pass any required safety inspections and meet the insurer’s age and condition criteria (typically, vehicles older than 20 years may not be covered).'),
    ('CAR-4', 'Driving record requirements: DUI and violations',
     'The primary policyholder and all listed drivers must have a reasonably clean driving record. A history of major violations (DUI, reckless driving) or multiple minor infractions (speeding, accidents) within the last 3-5 years may impact eligibility or lead to higher premiums. Recent license suspensions or revocations may result in disqualification.'),
    ('CAR-5', 'Insurance history: lapses, fraud, claims',
     'Applicants must provide details of their prior insurance coverage, including any lapses in coverage. A history of insurance fraud, frequent claims, or policy cancellations due to non-payment may impact eligibility.'),
    ('CAR-6', 'Residency, vehicle location and credit score',
     'The applicant must reside in the country or state where the policy is issued and provide a valid address. The vehicle must be primarily garaged at the declared location. Out-of-country usage may require additional coverage. Some insurers use credit scores as part of the eligibility assessment. Poor credit history may result in higher premiums or impact eligibility, subject to local regulations.'),
    ('CAR-7', 'Usage restrictions: ridesharing, delivery and modifications',
     'Vehicles used for ridesharing, delivery services, or other commercial purposes may not be eligible under a standard personal auto policy. Modifications to the vehicle (e.g., performance enhancements) must be declared and may affect eligibility or coverage terms.'),
    ('CAR-8', 'Minimum liability coverage and exclusions',
     'The applicant must purchase at least the minimum liability coverage required by law in their state or country. Additional coverage options (collision, comprehensive) may be offered but are subject to the insurer’s approval based on eligibility criteria. Certain high-risk drivers or vehicles (e.g., high-performance sports cars, vehicles with a salvage title) may be excluded from standard coverage. Eligibility does not guarantee favorable premium rates; rates may be adjusted based on risk factors.'),
]))

P.append(('POL-LUG', 'v1', 'SkyWings Airlines Luggage Compliance and Pricing Policy', '2024-11-01', 'luggage/luggage_policy.txt', [
    ('LUG-3', 'Carry-on baggage allowance and size limits',
     'Economy Class: One carry-on bag plus one personal item (e.g., purse, laptop bag). Carry-on bag must not exceed 55 cm x 40 cm x 23 cm (22 in x 16 in x 9 in). Combined weight not to exceed 7 kg (15 lbs). Business/First Class: Two carry-on bags plus one personal item. Each bag must not exceed 55 cm x 40 cm x 23 cm. Combined weight not to exceed 12 kg (26 lbs). All carry-on items must fit in the overhead compartment or under the seat in front. Items exceeding size or weight limits must be checked in.'),
    ('LUG-4', 'Checked baggage allowance by class, children and infants',
     'Economy Class: One piece. Up to 23 kg (50 lbs). Total dimensions (L + W + H) not exceeding 158 cm (62 in). Business Class: Two pieces. Each up to 32 kg (70 lbs). Total dimensions per piece not exceeding 158 cm. First Class: Three pieces. Each up to 32 kg. Total dimensions per piece not exceeding 158 cm. Children (2-11 years): Same allowance as accompanying adult. Infants (under 2 years): One piece up to 10 kg (22 lbs), plus a collapsible stroller.'),
    ('LUG-5', 'Excess baggage fees: overweight, oversized and extra pieces',
     'Overweight Bags (23-32 kg in Economy Class): Fee: $75 per bag. Oversized Bags (Dimensions 159-203 cm): Fee: $100 per bag. Extra Pieces: Fee: $150 per additional piece. No single piece over 32 kg (70 lbs) or exceeding 203 cm (80 in) in total dimensions will be accepted as checked baggage and must be shipped as cargo.'),
    ('LUG-6', 'Special items: sports equipment, musical instruments, fragile items',
     'Items like bicycles, golf clubs, skis, and snowboards are accepted. May incur oversize or overweight fees if exceeding standard allowances. Must be properly packed in protective cases. Small instruments can be carried on board if they fit in the overhead compartment. Larger instruments must be checked or a separate seat must be purchased. Recommend purchasing a seat for items that are fragile and meet size requirements. Airline is not responsible for damage to fragile items checked in.'),
    ('LUG-7', 'Prohibited and restricted baggage items',
     'Prohibited Items: Explosives, flammable liquids, gases, toxic substances, and other hazardous materials. Firearms and weapons unless declared and approved according to regulations. Restricted Items in Carry-On: Liquids exceeding 100 ml must be placed in checked baggage. Sharp objects must be checked in.'),
    ('LUG-8', 'Baggage check-in time and identification',
     "Passengers must check in baggage at least 3 hours before departure for international flights and 2 hours for domestic flights. All bags must have the passenger's name and contact information on the inside and outside."),
    ('LUG-10', 'Lost, delayed or damaged baggage reporting and liability',
     'Must be reported within 4 hours for domestic flights and 21 days for international flights. Compensation according to the Montreal Convention and applicable local laws. Maximum Liability: Up to $1,800 per passenger. Higher value items should be insured separately. Airline liability is limited to proven damages up to $1,800 per passenger. Not liable for fragile, valuable, or perishable items.'),
    ('LUG-12', 'Special assistance: mobility aids, elderly and unaccompanied minors',
     'Mobility aids (wheelchairs, walkers) transported free of charge. Must notify the airline at least 48 hours in advance. Elderly and Unaccompanied Minors: Assistance available for baggage handling upon request.'),
]))

P.append(('POL-BRD', 'v1', 'Border Compliance Policy for Imported Goods', '2025-08-01', 'border-control/border-goods-policy.txt', [
    ('BRD-1', 'Prohibited imports: firearms, explosives, endangered species',
     'Goods are not permitted to enter the country if they fall under the following categories: Firearms, Explosives, Endangered species (including protected animals, plants, or products derived from them). All other goods are generally permitted, subject to proper documentation and compliance with other customs rules.'),
    ('BRD-2', 'Import documents: commercial invoice over $1,000 and import license',
     'A commercial invoice is required if the total value of the shipment exceeds $1,000 USD. An import license is required if the goods are legally classified as controlled items. This includes sensitive technologies, certain chemicals, and goods subject to trade restrictions.'),
    ('BRD-3', 'Customs duty rates and the EU 0% rate',
     'Goods originating from the European Union that are not agricultural products benefit from a 0% duty rate under applicable trade agreements. For all other goods, customs duties apply based on: The type of goods, The country of origin. Duty rates are set according to an official tariff schedule published by the Customs Authority.'),
    ('BRD-4', 'Customs declaration type: simplified up to $2,500, standard above',
     'Shipments valued at $2,500 USD or less may use a Simplified Customs Declaration. Shipments valued above $2,500 USD must use the Standard Customs Declaration.'),
    ('BRD-5', 'Shipment inspection: electronics, luxury goods, high-risk origin',
     'Shipments are subject to inspection if: The goods include electronics or luxury items. The goods are declared as luxury goods. The goods originate from a high-risk country (as defined by customs enforcement criteria). If none of these conditions apply, the shipment is not flagged for inspection unless otherwise warranted.'),
]))

P.append(('POL-ENV', 'v1', 'Air Pollution Compliance Policy for Airplanes (SAPCPA-2025)', '2025-01-01', 'air_transport/airplane_pollution_compliance.txt', [
    ('ENV-0', 'Scope: commercial aircraft in GAEA jurisdiction',
     'Scope: All commercial aircraft operating flights that depart from, arrive at, or transit through the jurisdiction of the Global Aviation Environmental Authority (GAEA).'),
    ('ENV-1', 'Emissions monitoring, annual reporting by March 31 and 7-year retention',
     'Every aircraft operator must monitor and record CO₂ emissions and fuel consumption for each flight using approved fuel measurement methods (fuel uplift, fuel flow meters, or block-off estimates). Monitoring data must include: Aircraft ID, Flight number, Departure and arrival airports, Flight time, Fuel type and volume, CO₂ emissions (calculated using standard emission factors). Emissions reports must be: Submitted annually by March 31st for the preceding calendar year. Verified by an accredited third-party verifier. Retained for a minimum of 7 years.'),
    ('ENV-2', 'Emission limits: CO2 per RPK, NOx and particulate matter',
     'Aircraft models certified on or after Jan 1, 2025, must meet the following per-seat CO₂ emissions standard: ≤ 85 grams CO₂ per Revenue Passenger Kilometer (RPK). Aircraft engines must not exceed the following certified limits for Nitrogen Oxides (NOx): ≤ 15 grams NOx per kilonewton of rated thrust during the Landing and Takeoff (LTO) cycle. Aircraft must not emit Visible Smoke or exceed Particulate Matter (PM) thresholds as follows: ≤ 20 mg PM / kg fuel during LTO operations.'),
    ('ENV-3', 'Carbon offsetting (CORSIA) above 10,000 tonnes CO2',
     'Operators emitting more than 10,000 metric tons of CO₂ annually from international flights must: Participate in the GAEA Offsetting Mechanism. Purchase offset credits equivalent to their excess emissions above their baseline allocation (average of 2019–2020 CO₂ emissions). Operators may reduce offset obligations using Sustainable Aviation Fuel (SAF) with a verified lifecycle reduction ≥ 70% vs Jet-A.'),
    ('ENV-4', 'Sustainable aviation fuel (SAF) credits',
     'A SAF credit shall be granted when: SAF is blended at ≥ 10% volume on any flight. The SAF meets GAEA sustainability criteria and is certified by an approved body. Each liter of SAF used reduces offsetting obligation by: 2.5 kg of CO₂-equivalent, if the SAF lifecycle reduction is ≥ 80%.'),
    ('ENV-5', 'Ground operations: APU use and electric ground support equipment by 2027',
     'Operators must avoid auxiliary power unit (APU) use when Fixed Electrical Ground Power (FEGP) is available, except under operational emergency. All Ground Support Equipment (GSE) operating in GAEA airports must be electric or hybrid by 2027.'),
    ('ENV-6', 'Fleet compliance: new aircraft, retrofit by 2030, phase-out by 2032',
     'Operators may not introduce new aircraft into service unless the aircraft type: Has been certified under the GAEA 2025 CO₂ standard. Meets the NOx and PM limits in Section 2. Existing aircraft that do not comply with Section 2 must: Be retrofitted by 2030, or Be phased out of service before 2032.'),
    ('ENV-7', 'Emissions compliance penalties, audits and appeals',
     'Failure to comply results in: Administrative penalties of up to $100 per metric ton of unreported or unoffset CO₂. Suspension of route rights for continuous or willful violations. GAEA may conduct random audits and on-site inspections. Operators may appeal compliance decisions within 30 days of notice.'),
]))


def doc(pid, ver, title, eff, src, clauses):
    # checkable: false throughout: the compliance checker only knows retention_days_max and approver_threshold_inr,
    # and none of these clauses is one of those. They answer questions; they never get a verdict guessed for them.
    fm = {'doc_type': 'policy_version', 'policy_id': pid, 'version': ver, 'title': title, 'effective_from': eff,
          'source': SRC + src,
          'clauses': [{'clause_id': c, 'title': t, 'text': x, 'checkable': False} for c, t, x in clauses]}
    head = yaml.safe_dump(fm, sort_keys=False, allow_unicode=True, width=10_000)
    head = head.replace(f"effective_from: '{eff}'", f'effective_from: {eff}')  # a bare YAML date, as ingest requires
    body = '\n\n'.join(f'**{c} {t}.** {x}' for c, t, x in clauses)
    return f'---\n{head}---\n# {title} ({ver})\n\nEffective from {eff}.\n\n{body}\n'


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob('*.md'):
        f.unlink()
    ids = []
    for pid, ver, title, eff, src, clauses in P:
        assert (ROOT / SRC / src).is_file(), f'missing source {src}: fetch the corpus first'
        ids += [f'{c}@{ver}' for c, *_ in clauses]
        (OUT / f'{pid}-{ver}.md').write_text(doc(pid, ver, title, eff, src, clauses), encoding='utf-8', newline='\n')
    assert len(ids) == len(set(ids)), 'duplicate clause ids'
    print(f'{len(P)} documents, {len(ids)} clauses -> {OUT.relative_to(ROOT)}')
