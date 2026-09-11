/**
 * Wikipedia-Style Encyclopedic Monograph View
 * Renders structured, cross-linked diagnostic articles with
 * anchor navigation, medical mimic matrices, and action triggers.
 */

class WikiArticleRenderer {
  /**
   * Escape HTML to prevent XSS (Security First)
   */
  static escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Highlight query terms inside text safely
   */
  static highlightTerms(text, terms) {
    if (!text || !terms || !terms.length) return WikiArticleRenderer.escapeHTML(text);
    const escaped = WikiArticleRenderer.escapeHTML(text);
    
    // Build regex from positive search terms (ignoring small terms < 2 chars)
    const validTerms = terms
      .map(t => t.value)
      .filter(v => v && v.length >= 2)
      .map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      
    if (!validTerms.length) return escaped;

    const regex = new RegExp(`(${validTerms.join('|')})`, 'gi');
    return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  /**
   * Render complete Wikipedia-style encyclopedic monograph for a disorder
   */
  static renderDisorder(disorder, queryTerms = []) {
    if (!disorder) return '<div class="error-msg">Disorder record not found.</div>';

    const safeName = WikiArticleRenderer.escapeHTML(disorder.name);
    const safeCat = WikiArticleRenderer.escapeHTML(disorder.category);
    const safeIcd10 = WikiArticleRenderer.escapeHTML(disorder.icd10 || 'Unassigned');
    const safeIcd11 = WikiArticleRenderer.escapeHTML(disorder.icd11 || 'Unassigned');
    const highlightedSymptoms = WikiArticleRenderer.highlightTerms(disorder.symptoms, queryTerms);

    // Render Differentials Table Rows
    let diffRowsHTML = '';
    if (Array.isArray(disorder.differentials) && disorder.differentials.length > 0) {
      diffRowsHTML = disorder.differentials.map((d, i) => {
        const safeDiscipline = WikiArticleRenderer.escapeHTML(d.discipline || 'General Medicine');
        const safeMimic = WikiArticleRenderer.escapeHTML(d.mimic || 'Unknown Mimic');
        const highlightedOverlap = WikiArticleRenderer.highlightTerms(d.overlap, queryTerms);
        const highlightedSigns = WikiArticleRenderer.highlightTerms(d.physical_signs, queryTerms);
        const highlightedWorkup = WikiArticleRenderer.highlightTerms(d.workup, queryTerms);

        return `
          <tr class="mimic-row" id="mimic-item-${i}">
            <td class="col-discipline"><span class="discipline-tag">${safeDiscipline}</span></td>
            <td class="col-mimic">
              <strong class="mimic-title">${safeMimic}</strong>
              <button type="button" class="btn-mimic-dossier" data-mimic-name="${safeMimic}" title="View Canonical Mimic Dossier">
                🔍 Lookup Mimic
              </button>
            </td>
            <td class="col-overlap">${highlightedOverlap}</td>
            <td class="col-signs">${highlightedSigns}</td>
            <td class="col-workup">
              <div class="workup-box">${highlightedWorkup}</div>
            </td>
          </tr>
        `;
      }).join('');
    } else {
      diffRowsHTML = '<tr><td colspan="5" class="text-muted">No differential matrix records available.</td></tr>';
    }

    // Render Red Flags List
    let redFlagsHTML = '';
    if (Array.isArray(disorder.red_flags) && disorder.red_flags.length > 0) {
      redFlagsHTML = `
        <div class="red-flags-card" id="section-red-flags">
          <div class="red-flags-header">
            <span class="red-flag-icon">⚠️</span>
            <h3>Acute Physiological Red Flags &amp; Immediate Action Thresholds</h3>
          </div>
          <p class="red-flag-notice">The presence of any of the following physiological or cognitive red flags warrants immediate medical referral or emergency clearance before attributing symptoms solely to psychiatric etiology:</p>
          <ul class="red-flags-list">
            ${disorder.red_flags.map(rf => `<li>${WikiArticleRenderer.highlightTerms(rf, queryTerms)}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    return `
      <article class="wiki-article" data-disorder-index="${disorder.index}">
        <!-- Top Metadata & Action Bar -->
        <header class="wiki-header">
          <div class="wiki-breadcrumbs">
            <span class="crumb-category">${safeCat}</span>
            <span class="crumb-sep">›</span>
            <span class="crumb-index">Disorder #${disorder.index}</span>
          </div>
          <h1 class="wiki-title">${safeName}</h1>
          
          <div class="wiki-classification-bar">
            <div class="code-pill code-icd10"><span class="code-label">ICD-10-CM</span> <strong>${safeIcd10}</strong></div>
            <div class="code-pill code-icd11"><span class="code-label">ICD-11</span> <strong>${safeIcd11}</strong></div>
          </div>
        </header>

        <!-- Encyclopedic Layout: Floating Table of Contents + Body -->
        <div class="wiki-body-layout">
          <nav class="wiki-toc" aria-label="Table of Contents">
            <div class="toc-title">Contents</div>
            <ul class="toc-list">
              <li><a href="#section-overview">1 Overview &amp; Criteria</a></li>
              <li><a href="#section-differentials">2 Multidisciplinary Mimics Matrix</a></li>
              <li><a href="#section-workup">3 Tiered Diagnostic Workups</a></li>
              ${disorder.red_flags && disorder.red_flags.length ? '<li><a href="#section-red-flags">4 Acute Red Flags</a></li>' : ''}
              <li><a href="#section-actions">5 Clinical Referral Forms</a></li>
            </ul>
            
            <div class="toc-quick-actions">
              <div class="toc-actions-title">Point-of-Care Forms</div>
              <button type="button" class="btn-action-crisis" data-action="crisis-form" data-disorder-index="${disorder.index}">
                🚨 Emergency Transfer Form
              </button>
              <button type="button" class="btn-action-consult" data-action="consult-form" data-disorder-index="${disorder.index}">
                📋 Medical Rule-Out Request
              </button>
            </div>
          </nav>

          <main class="wiki-content-pane">
            <!-- 1. Overview & DSM Diagnostic Criteria -->
            <section id="section-overview" class="wiki-section">
              <h2 class="wiki-section-heading"><span class="section-num">1</span> Essential Diagnostic Symptoms &amp; Clinical Criteria</h2>
              <div class="wiki-text-block">
                <p class="lead-symptoms">${highlightedSymptoms}</p>
              </div>
            </section>

            <!-- 2. Medical Mimics Differential Matrix -->
            <section id="section-differentials" class="wiki-section">
              <h2 class="wiki-section-heading"><span class="section-num">2</span> Multidisciplinary Medical &amp; Organic Differential Matrix</h2>
              <p class="section-intro">Differential diagnosis mapped across internal medicine, neurology, endocrinology, infectious disease, and toxicology. Discriminating signs indicate non-psychiatric etiologies.</p>
              
              <div class="table-responsive">
                <table class="wiki-matrix-table">
                  <thead>
                    <tr>
                      <th style="width: 14%;">Medical Discipline</th>
                      <th style="width: 20%;">Organic Mimic</th>
                      <th style="width: 22%;">Symptom Overlap</th>
                      <th style="width: 22%;">Discriminating Physical Signs</th>
                      <th style="width: 22%;">Confirmatory Diagnostic Workup</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${diffRowsHTML}
                  </tbody>
                </table>
              </div>
            </section>

            <!-- 3. Red Flags -->
            ${redFlagsHTML}

            <!-- 4. Clinical Referral & Crisis Drafting Actions -->
            <section id="section-actions" class="wiki-section clinical-actions-section">
              <h2 class="wiki-section-heading"><span class="section-num">3</span> Point-of-Care Interprofessional Communication</h2>
              <p class="section-intro">Draft standardized, HIPAA-aligned interdisciplinary referral documents pre-populated with diagnostic details from this entry. All generation is executed 100% locally in browser memory.</p>

              <div class="action-cards-grid">
                <!-- Card 1: Emergency Transfer -->
                <div class="action-card card-crisis">
                  <div class="action-card-badge">Emergency Handoff</div>
                  <h3>Urgent Crisis Transfer &amp; Acute Medical Clearance Form</h3>
                  <p>For acute sensorium changes, severe autonomic instability, suspected toxic ingestion, neuroleptic malignant syndrome (NMS), or catatonia requiring immediate ED evaluation.</p>
                  <ul class="card-features">
                    <li>✓ Auto-loads patient diagnostic profile &amp; red flags</li>
                    <li>✓ Standardized ED receiving triage letterhead</li>
                    <li>✓ Direct Print to PDF &amp; EHR clipboard copy</li>
                  </ul>
                  <button type="button" class="btn-primary-action btn-red" data-action="crisis-form" data-disorder-index="${disorder.index}">
                    🚨 Draft Urgent Crisis Transfer Form
                  </button>
                </div>

                <!-- Card 2: Outpatient Consultation -->
                <div class="action-card card-consult">
                  <div class="action-card-badge">Routine / Specialty Referral</div>
                  <h3>Outpatient Clinical Consultation &amp; Medical Rule-Out Request</h3>
                  <p>For collaborative referral to primary care, neurology, endocrinology, or sleep medicine to rule out organic contributors for atypical or treatment-refractory symptoms.</p>
                  <ul class="card-features">
                    <li>✓ Pre-populates Tier 1 Baseline &amp; Tier 2 Targeted Lab Panels</li>
                    <li>✓ Structured checkboxes for observable clinical red flags</li>
                    <li>✓ Standardized HIPAA-aligned letterhead</li>
                  </ul>
                  <button type="button" class="btn-primary-action btn-blue" data-action="consult-form" data-disorder-index="${disorder.index}">
                    📋 Draft Medical Rule-Out Request
                  </button>
                </div>
              </div>
            </section>
          </main>
        </div>
      </article>
    `;
  }

  /**
   * Render Canonical Medical Mimic Dossier Modal
   */
  static renderMimicDossier(mimic) {
    if (!mimic) return '<div class="error-msg">Mimic record not found.</div>';

    const safeName = WikiArticleRenderer.escapeHTML(mimic.name);
    const safeIcd = WikiArticleRenderer.escapeHTML(mimic.icd10 || 'Unassigned');
    const safeDisc = WikiArticleRenderer.escapeHTML(mimic.discipline || 'Internal Medicine');
    const safeSymptoms = WikiArticleRenderer.escapeHTML(mimic.systemic_symptoms || 'None specified');
    const safeSigns = WikiArticleRenderer.escapeHTML(mimic.physical_signs || 'None specified');
    const safeWorkup = WikiArticleRenderer.escapeHTML(mimic.diagnostic_workup || 'None specified');

    return `
      <div class="mimic-dossier-card">
        <div class="dossier-header">
          <div class="dossier-badge">${safeDisc}</div>
          <h2 class="dossier-title">${safeName}</h2>
          <div class="dossier-icd">ICD-10-CM: <strong>${safeIcd}</strong></div>
        </div>

        <div class="dossier-content">
          <div class="dossier-section">
            <h4>Systemic Pathology &amp; Clinical Presentation</h4>
            <p>${safeSymptoms}</p>
          </div>

          <div class="dossier-section">
            <h4>Key Discriminating Physical Signs &amp; Examination Clues</h4>
            <p>${safeSigns}</p>
          </div>

          <div class="dossier-section dossier-workup-highlight">
            <h4>Tiered Confirmatory Diagnostic Workup &amp; Laboratory Reference Values</h4>
            <div class="workup-box">${safeWorkup}</div>
          </div>
        </div>
      </div>
    `;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WikiArticleRenderer;
}
