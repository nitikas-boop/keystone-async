---
doc_type: policy_version
policy_id: POL-DSC
version: v1
title: Acme Corp Discount Approval Policy
effective_from: 2025-01-01
source: data/external/policy-corpus/marketing/discount/discount_approval.txt
clauses:
- clause_id: DSC-0
  title: Scope of the discount approval policy
  text: 'This policy governs all discount approvals for customer deals submitted by the sales team. It applies to Sales Representatives, Sales Managers, and Finance Officers. Policy Owner: Sales Operations. Reviewed semi-annually.'
  checkable: false
- clause_id: DSC-1
  title: Discount limits by customer tier
  text: 'Sales Representatives may approve discounts based on the customer’s classification in the CRM system. Customers are grouped into three tiers: Tier 1 (Enterprise), Tier 2 (SMB), and Tier 3 (Startups). The maximum allowable discount without further approval is 20% for Tier 1 customers, 15% for Tier 2 customers, and 10% for Tier 3 customers.'
  checkable: false
- clause_id: DSC-2
  title: Deal size restrictions on discounts
  text: For deals under $5,000, the representative may approve discounts up to their tier-based maximum. For deals between $5,000 and $25,000, any discount exceeding 10% requires approval from a Sales Manager, regardless of the customer tier. For deals over $25,000, Finance approval is required for any discount above 5%.
  checkable: false
- clause_id: DSC-3
  title: Minimum gross margin of 30%
  text: No discount shall be granted if the resulting gross margin falls below 30%, unless explicitly approved by the Vice President of Sales. The gross margin must be computed using the CPQ tool’s automatic calculation, factoring in current pricing and cost structures.
  checkable: false
- clause_id: DSC-4
  title: 'Discount approval workflow: Sales Manager and Finance'
  text: Sales Managers may approve discounts up to 25%, provided the gross margin remains at or above 30%. Any discount above 25%, or any case where the gross margin drops below 35%, must also be approved by a Finance Officer. Additionally, if the deal includes a bundled offer involving hardware, Finance must co-approve regardless of margin.
  checkable: false
- clause_id: DSC-5
  title: Automatic discount approval criteria
  text: 'A discount may be automatically approved without human intervention if all the following conditions are met: the discount is within the representative’s tier limit, the customer has no overdue invoices in the past 12 months, the quote uses the standard pricing template, and no custom contract terms are included.'
  checkable: false
- clause_id: DSC-6
  title: Discount exceptions and the Deal Desk Committee
  text: Any discount request that does not meet the criteria outlined in this policy must be submitted as an exception using the Discount Justification Form available in Salesforce. All exceptions are reviewed on a weekly basis by the Deal Desk Committee, which may grant or deny approval based on strategic or financial considerations.
  checkable: false
---
# Acme Corp Discount Approval Policy (v1)

Effective from 2025-01-01.

**DSC-0 Scope of the discount approval policy.** This policy governs all discount approvals for customer deals submitted by the sales team. It applies to Sales Representatives, Sales Managers, and Finance Officers. Policy Owner: Sales Operations. Reviewed semi-annually.

**DSC-1 Discount limits by customer tier.** Sales Representatives may approve discounts based on the customer’s classification in the CRM system. Customers are grouped into three tiers: Tier 1 (Enterprise), Tier 2 (SMB), and Tier 3 (Startups). The maximum allowable discount without further approval is 20% for Tier 1 customers, 15% for Tier 2 customers, and 10% for Tier 3 customers.

**DSC-2 Deal size restrictions on discounts.** For deals under $5,000, the representative may approve discounts up to their tier-based maximum. For deals between $5,000 and $25,000, any discount exceeding 10% requires approval from a Sales Manager, regardless of the customer tier. For deals over $25,000, Finance approval is required for any discount above 5%.

**DSC-3 Minimum gross margin of 30%.** No discount shall be granted if the resulting gross margin falls below 30%, unless explicitly approved by the Vice President of Sales. The gross margin must be computed using the CPQ tool’s automatic calculation, factoring in current pricing and cost structures.

**DSC-4 Discount approval workflow: Sales Manager and Finance.** Sales Managers may approve discounts up to 25%, provided the gross margin remains at or above 30%. Any discount above 25%, or any case where the gross margin drops below 35%, must also be approved by a Finance Officer. Additionally, if the deal includes a bundled offer involving hardware, Finance must co-approve regardless of margin.

**DSC-5 Automatic discount approval criteria.** A discount may be automatically approved without human intervention if all the following conditions are met: the discount is within the representative’s tier limit, the customer has no overdue invoices in the past 12 months, the quote uses the standard pricing template, and no custom contract terms are included.

**DSC-6 Discount exceptions and the Deal Desk Committee.** Any discount request that does not meet the criteria outlined in this policy must be submitted as an exception using the Discount Justification Form available in Salesforce. All exceptions are reviewed on a weekly basis by the Deal Desk Committee, which may grant or deny approval based on strategic or financial considerations.
