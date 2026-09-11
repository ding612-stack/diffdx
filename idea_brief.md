# Idea Brief: Clinical Differential Diagnosis Engine & Referral PWA

**Status**: 🟡 `Draft`  
**Origin Conversation**: [DSM Textbook Implementation Plan](conversation://2cf534ec-1153-4b85-8cf9-1a65f6a4e326)  
**Cybersecurity Reference**: [Project Cybersecurity Documentation](conversation://8f6f018d-86f4-46d7-a245-3bf84aef602b)  
**Companion Artifact**: `book_v2.pdf` (*The Clinical & Medical Differential Diagnosis Desk Reference*)  
**Created Date**: 2026-09-11  
**Tags**: `pwa`, `differential-diagnosis`, `boolean-search`, `psychiatry`, `internal-medicine`, `cybersecurity`, `clinical-referrals`

---

## 1. Executive Summary & Problem Statement
- **Problem**: 
  Point-of-care clinical psychiatric triage requires fast, reliable differential evaluation between intra-psychiatric disorders and organic medical mimics (e.g., endocrine, neurological, toxicological, and autoimmune conditions). Clinicians navigating thick printed references or slow, login-gated electronic databases lose critical minutes during acute evaluations. Existing diagnostic tools either lack robust organic medical rule-outs, require cumbersome user sign-ins that raise HIPAA data liability risks, or lack direct mechanisms to generate standard interdisciplinary referral and crisis transfer documentation.
- **Proposed Solution**: 
  A high-speed, zero-authentication, offline-first Progressive Web App (PWA) operating directly on the validated 190-disorder and 106-mimic ontology from *The Clinical & Medical Differential Diagnosis Desk Reference*. The PWA features:
  1. **Academic Database Search Engine**: A search interface emulating PubMed, PsycINFO, and ERIC with full Boolean logic (`AND`, `OR`, `NOT`, quoted phrases, and field tags `sym:`, `icd:`, `mimic:`, `redflag:`).
  2. **Graduated Fit Ranking**: Results classified dynamically from **Best Fit** (high criterion overlap) to **Moderate Fit** (secondary differential) to **Loose Association** (screening/rule-out consideration).
  3. **Wikipedia-Style Encyclopedic Views**: Fast, cross-linked, readable disorder monographs with quick table of contents, clinical criteria, organic mimics matrices, physical signs, and laboratory workups.
  4. **One-Click Clinical Referral & Crisis Drafting**: Integrated instant generators for both:
     - *Urgent Crisis Transfer & Acute Medical Clearance Form*
     - *Outpatient Clinical Consultation & Medical Rule-Out Request*
  5. **Zero-Attack Surface & Zero-PHI Privacy**: Completely client-side execution with hardened Content Security Policy (CSP), eliminating server-side vulnerabilities (IDOR, SQLi, SSRF) and ensuring 100% patient confidentiality under HIPAA.

---

## 2. Theoretical Foundations & Core Mechanism
- **Core Hypothesis**: 
  Deterministic, client-side inverted-index search paired with a Boolean AST parser provides sub-millisecond retrieval across clinical psychiatric matrices without server round-trips, while guaranteeing absolute data privacy and eliminating the cyberattack surface inherent to authenticated web apps.
- **Graduated Differential Ranking Formula**:
  Scores are computed across weighted document fields:
  - Exact term matches in `symptoms` and `differentials.overlap` (Weight: 3.0)
  - Matches in `differentials.physical_signs` and `differentials.mimic` (Weight: 2.5)
  - Matches in `red_flags` (Weight: 2.0)
  - Matches in `category` / general text (Weight: 1.0)
  Threshold cutoffs classify results:
  - 🟢 **Best Fit** ($\ge 75\%$ relative score or all mandatory Boolean criteria satisfied)
  - 🟡 **Moderate Fit** ($40\% - 74\%$ overlap)
  - ⚪ **Loose Association** ($15\% - 39\%$ peripheral association / exploratory rule-out)
- **Zero-Trust Clinical Data Isolation**:
  Because no patient health information (PHI) is ever transmitted over network sockets or stored in server databases, the application achieves zero data breach liability by design.

---

## 3. Proposed Implementation & Architecture
- **Component Breakdown**:
  1. *Search & Query Parser Module*: Lexes and evaluates Boolean query expressions (`AND`, `OR`, `NOT`, parentheses, phrase quotes, field qualifiers) with live syntax hint chips.
  2. *In-Memory Differential Scoring Engine*: Indexes `disorders_master.json` and `medical_mimics_ontology.json` using a lightweight inverted index (e.g., MiniSearch or optimized trie).
  3. *Wikipedia-Style Reader & Navigation UI*: Encyclopedic layout with sticky sidebar table of contents, breadcrumbs, ICD-10/ICD-11 badges, expandable laboratory panels, and internal wiki-links.
  4. *Referral & Crisis Form Generator*: Modals and print-optimized views for the two standard clinical forms, auto-populating disorder details, red flags, and diagnostic panels with instant "Print to PDF" and "Copy to Clipboard" capabilities.
  5. *PWA Service Worker & Cache Layer*: Caches all assets and data locally for instant sub-10ms offline execution.
- **Tech Stack**:
  - Runtime / UI: Modern Vanilla TypeScript / Vite or Preact (lightweight, zero unnecessary dependencies, ultra-fast bundle < 150 KB).
  - Styling: Clean academic/clinical typography inspired by Wikipedia and PubMed, responsive across mobile, tablet, and desktop.
  - Form Printing: Print CSS stylesheets adhering to medical documentation standards (8.5" x 11" clean layout).
  - Security Layer: Strict Content Security Policy, DOMPurify for any rich text formatting, Subresource Integrity, zero telemetry/analytics scripts.

---

## 4. Key Assumptions & Anticipated Bottlenecks
- **Assumptions**:
  - The complete diagnostic database (~620 KB raw JSON) compresses to under 90 KB via gzip/brotli and comfortably resides in client browser memory.
  - Clinicians require rapid point-of-care utility without the friction of account creation or password management.
- **Anticipated Bottlenecks & Mitigations**:
  - *Query Ambiguity*: Novice users might input complex natural language instead of Boolean terms. *Mitigation*: Provide instant query-expansion chips, search hints, and fallback to fuzzy OR matching when Boolean syntax yields zero hits.
  - *Form Persistence*: Because there is no backend, refreshing the browser could lose draft form inputs. *Mitigation*: Use optional ephemeral session storage (`sessionStorage`) that clears on tab close, avoiding persistent local storage of patient data.

---

## 5. Audit Requests for Auditor
- [ ] Evaluate Boolean query tokenization accuracy and search ranking performance against clinical psychiatric test queries.
- [ ] Review adherence to HIPAA Security Rule and verify absence of client-side data leaks or third-party telemetry.
- [ ] Inspect medical referral form fields against hospital emergency department and outpatient consultation standards.
- [ ] Benchmark PWA Lighthouse performance (Performance, Accessibility, Best Practices, PWA status).
