/**
 * Clinical Referral & Crisis Transfer Form Generator
 * Handles interactive drafting, pre-populating disorder criteria,
 * print-to-PDF formatting, and clipboard export for EHR documentation.
 */

class FormDrawerManager {
  constructor() {
    this.activeDisorder = null;
    this.activeFormType = null; // 'crisis' or 'consult'
  }

  /**
   * Escape HTML utility
   */
  static escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Parse ICD-10 string into individually selectable subcode items
   */
  static parseIcdSubcodes(rawIcd) {
    if (!rawIcd || typeof rawIcd !== 'string') return [];
    
    // Split on commas or semicolons
    const parts = rawIcd.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      return parts.map(p => ({
        code: p,
        isMultiple: true
      }));
    }
    return [{ code: rawIcd.trim(), isMultiple: false }];
  }

  /**
   * Render interactive ICD-10 subcode selector
   * If disorder has multiple subcodes, renders checkboxes (unchecked by default).
   * Clinicians can select one or multiple applicable codes.
   */
  static renderIcdSelector(rawIcd) {
    const subcodes = FormDrawerManager.parseIcdSubcodes(rawIcd);
    if (!subcodes.length) return '';

    if (subcodes.length === 1 && !subcodes[0].isMultiple) {
      return `
        <div class="icd-selector-row" style="margin-top: 4px; font-size: 11px;">
          <strong>ICD-10-CM Code:</strong> <span class="icd-code-text">${FormDrawerManager.escape(subcodes[0].code)}</span>
          <input type="hidden" name="form_single_icd" value="${FormDrawerManager.escape(subcodes[0].code)}">
        </div>
      `;
    }

    return `
      <div class="icd-selector-container" style="margin-top: 6px; padding: 8px 10px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 5px;">
        <div class="icd-selector-title" style="font-size: 11px; font-weight: bold; margin-bottom: 5px; color: #1e293b;">
          Select Applicable ICD-10 Subcode(s) (None preselected; check all that apply):
        </div>
        <div class="icd-subcodes-checklist" style="display: flex; flex-direction: column; gap: 4px;">
          ${subcodes.map((item, idx) => `
            <label class="form-checkbox-label" style="font-size: 11px; cursor: pointer;">
              <input type="checkbox" name="form_icd_subcodes" value="${FormDrawerManager.escape(item.code)}">
              <span><strong>${FormDrawerManager.escape(item.code)}</strong></span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Open form modal with disorder data
   */
  openForm(disorder, formType = 'crisis') {
    this.activeDisorder = disorder;
    this.activeFormType = formType;

    const modal = document.getElementById('clinical-form-modal');
    const container = document.getElementById('clinical-form-container');
    if (!modal || !container) return;

    if (formType === 'crisis') {
      container.innerHTML = this.renderCrisisForm(disorder);
    } else {
      container.innerHTML = this.renderConsultationForm(disorder);
    }

    modal.classList.add('active');
    document.body.classList.add('modal-open');

    // Wire action buttons inside form
    this.attachFormEvents(container);
  }

  /**
   * Check if user has entered patient or clinician data into active form
   */
  hasUnsavedChanges() {
    const modal = document.getElementById('clinical-form-modal');
    if (!modal || !modal.classList.contains('active')) return false;

    const patientName = document.getElementById('patient_name')?.value?.trim();
    const clinicianName = document.getElementById('clinician_name')?.value?.trim();
    const patientMeds = document.getElementById('patient_meds')?.value?.trim();
    const consultPhysician = document.getElementById('consult_physician')?.value?.trim();

    return !!(patientName || clinicianName || patientMeds || consultPhysician);
  }

  /**
   * Close form modal with protection against accidental data loss
   */
  closeForm(force = false) {
    if (!force && this.hasUnsavedChanges()) {
      const confirmClose = window.confirm('You have entered clinical form details. Are you sure you want to close? All ephemeral entries will be cleared.');
      if (!confirmClose) return;
    }

    const modal = document.getElementById('clinical-form-modal');
    if (modal) {
      modal.classList.remove('active');
      document.body.classList.remove('modal-open');
    }
  }

  /**
   * Render Urgent Crisis Transfer & Acute Medical Clearance Form
   */
  renderCrisisForm(disorder) {
    const today = new Date().toISOString().split('T')[0];
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const safeName = FormDrawerManager.escape(disorder.name);
    const safeIcd = FormDrawerManager.escape(disorder.icd10 || 'Unassigned');

    // Extract top medical mimics to rule out
    const topMimics = Array.isArray(disorder.differentials)
      ? disorder.differentials.slice(0, 4).map(d => d.mimic).join(', ')
      : 'Acute metabolic, toxicological, or neurological pathology';

    // Build Red Flag Checkboxes
    let redFlagsListHTML = '';
    if (Array.isArray(disorder.red_flags) && disorder.red_flags.length > 0) {
      redFlagsListHTML = disorder.red_flags.map((rf, idx) => `
        <label class="form-checkbox-label">
          <input type="checkbox" name="crisis_red_flags" value="${FormDrawerManager.escape(rf)}" checked>
          <span>${FormDrawerManager.escape(rf)}</span>
        </label>
      `).join('');
    } else {
      redFlagsListHTML = `
        <label class="form-checkbox-label"><input type="checkbox" name="crisis_red_flags" value="Acute Altered Mental Status" checked><span>Acute Altered Mental Status / Fluctuating Sensorium</span></label>
        <label class="form-checkbox-label"><input type="checkbox" name="crisis_red_flags" value="Severe Autonomic Instability"><span>Severe Autonomic Instability (Severe tachycardia, marked HTN)</span></label>
        <label class="form-checkbox-label"><input type="checkbox" name="crisis_red_flags" value="Suspected Neuroleptic Malignant Syndrome"><span>Hyperthermia / Rigidity (Suspected NMS or Serotonin Syndrome)</span></label>
      `;
    }

    return `
      <div class="printable-form crisis-transfer-sheet" id="active-printable-document">
        <!-- Form Header / Letterhead -->
        <div class="form-letterhead letterhead-crisis">
          <h2 class="form-title">URGENT CRISIS TRANSFER &amp; ACUTE MEDICAL CLEARANCE FORM</h2>
          <div class="form-subtitle">Interprofessional Emergency Handoff &amp; Organic Rule-Out Directive</div>
        </div>

        <!-- Section 1: Patient & Clinician Identifiers -->
        <div class="form-grid-2col">
          <div class="form-field-group">
            <label>Patient Full Name / MRN:</label>
            <input type="text" id="patient_name" class="form-input" placeholder="e.g. John Doe / MRN-10492" required>
          </div>
          <div class="form-field-group">
            <label>Date of Birth (DOB):</label>
            <input type="date" id="patient_dob" class="form-input">
          </div>
          <div class="form-field-group">
            <label>Transfer Date &amp; Time:</label>
            <input type="text" id="transfer_time" class="form-input" value="${today} at ${nowTime}">
          </div>
          <div class="form-field-group">
            <label>Receiving Emergency Department (ED):</label>
            <input type="text" id="receiving_ed" class="form-input" placeholder="e.g. Valley Health Emergency Dept">
          </div>
        </div>

        <div class="form-grid-2col">
          <div class="form-field-group">
            <label>Transferring Clinician &amp; Degree:</label>
            <input type="text" id="clinician_name" class="form-input" placeholder="e.g. Dr. Jane Smith, Psy.D. / LCSW / LMFT">
          </div>
          <div class="form-field-group">
            <label>Clinician Phone &amp; Emergency Callback:</label>
            <input type="text" id="clinician_phone" class="form-input" placeholder="(555) 019-2834">
          </div>
        </div>

        <!-- Section 2: Clinical Presentation & Red Flags -->
        <div class="form-section-box">
          <div class="section-box-title">PRIMARY PSYCHIATRIC PRESENTATION UNDER EVALUATION</div>
          <div class="section-field-static"><strong>Presenting Syndrome:</strong> ${safeName}</div>
          ${FormDrawerManager.renderIcdSelector(disorder.icd10)}
          
          <div class="section-box-title" style="margin-top: 10px;">ACUTE PHYSIOLOGICAL RED FLAGS PROMPTING IMMEDIATE TRANSFER (Checked observed)</div>
          <div class="checkbox-stack">
            ${redFlagsListHTML}
            <label class="form-checkbox-label">
              <input type="checkbox" name="crisis_red_flags" value="Suspected Acute Toxic Ingestion or Withdrawal">
              <span>Suspected Acute Toxic Ingestion, Overdose, or Substance Withdrawal</span>
            </label>
            <label class="form-checkbox-label">
              <input type="checkbox" name="crisis_red_flags" value="Acute Psychosis with Focal Neurological Deficits">
              <span>Acute Psychosis / Delirium with Focal Neurological Signs or Recent Head Trauma</span>
            </label>
          </div>
        </div>

        <!-- Section 3: Medication & Rule-Out Directive -->
        <div class="form-grid-1col">
          <div class="form-field-group">
            <label>Suspected Organic Medical Mimics to Rule Out:</label>
            <input type="text" id="suspected_mimics" class="form-input" value="${FormDrawerManager.escape(topMimics)}">
          </div>
          <div class="form-field-group">
            <label>Current Known Medications &amp; Dosages:</label>
            <textarea id="patient_meds" class="form-textarea" rows="2" placeholder="List active psychiatric medications, recent titrations, or known over-the-counter substances..."></textarea>
          </div>
          <div class="form-field-group">
            <label>Specific Clinical Concerns &amp; Emergency Orders Requested:</label>
            <textarea id="additional_notes" class="form-textarea" rows="2">Urgent emergency medical evaluation and physiological clearance requested. Please conduct acute laboratory rule-outs (including CBC, CMP, Troponin, ECG, Toxicology Screen, and neurological assessment) before psychiatric disposition.</textarea>
          </div>
        </div>

        <!-- Section 4: Signature & Authorization -->
        <div class="form-signature-block">
          <div class="sig-line">
            <div class="sig-underline"></div>
            <div class="sig-caption">Referring Clinician Signature</div>
          </div>
          <div class="sig-line">
            <div class="sig-underline"></div>
            <div class="sig-caption">State License Number &amp; Date</div>
          </div>
        </div>

        <!-- Interactive Form Control Buttons (Hidden when printing) -->
        <div class="form-controls-bar no-print">
          <button type="button" class="btn-ctrl btn-ctrl-print" id="btn-print-form">
            🖨️ Print Form / Save as PDF
          </button>
          <button type="button" class="btn-ctrl btn-ctrl-copy" id="btn-copy-form-text">
            📋 Copy EHR Note
          </button>
          <button type="button" class="btn-ctrl btn-ctrl-close" id="btn-close-form">
            ✕ Close
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render OUTPATIENT CLINICAL CONSULTATION & MEDICAL RULE-OUT REQUEST
   */
  renderConsultationForm(disorder) {
    const today = new Date().toISOString().split('T')[0];
    const safeName = FormDrawerManager.escape(disorder.name);
    const safeIcd = FormDrawerManager.escape(disorder.icd10 || 'Unassigned');

    // Extract suggested Tier 2 lab workups
    let suggestedLabs = [];
    if (Array.isArray(disorder.differentials)) {
      disorder.differentials.forEach(d => {
        if (d.workup) {
          // Extract specific lab mentions
          const clean = d.workup.split(';')[0].trim();
          if (clean && !suggestedLabs.includes(clean)) {
            suggestedLabs.push(clean);
          }
        }
      });
    }
    const tier2LabSummary = suggestedLabs.slice(0, 3).join('; ') || 'Vitamin B12/Folate, 8:00 AM Cortisol, Ferritin, ESR/CRP';

    return `
      <div class="printable-form consultation-sheet" id="active-printable-document">
        <!-- Form Header / Letterhead -->
        <div class="form-letterhead letterhead-consult">
          <h2 class="form-title">OUTPATIENT CLINICAL CONSULTATION &amp; MEDICAL RULE-OUT REQUEST</h2>
        </div>

        <!-- Section 1: Transmittal Details -->
        <div class="form-grid-2col">
          <div class="form-field-group">
            <label>To (Physician / Practice Name):</label>
            <input type="text" id="consult_physician" class="form-input" placeholder="e.g. Dr. Robert Vance, MD / Internal Medicine">
          </div>
          <div class="form-field-group">
            <label>Specialty Practice:</label>
            <input type="text" id="consult_specialty" class="form-input" placeholder="Primary Care / Endocrinology / Neurology">
          </div>
          <div class="form-field-group">
            <label>Patient Full Name:</label>
            <input type="text" id="patient_name" class="form-input" placeholder="e.g. Jane Doe" required>
          </div>
          <div class="form-field-group">
            <label>DOB &amp; Reference / MRN:</label>
            <input type="text" id="patient_dob_mrn" class="form-input" placeholder="DOB: MM/DD/YYYY | MRN: 94821">
          </div>
        </div>

        <div class="form-grid-2col">
          <div class="form-field-group">
            <label>From (Referring Mental Health Clinician):</label>
            <input type="text" id="clinician_name" class="form-input" placeholder="e.g. Dr. Alex Mercer, Ph.D. / LMFT / LCSW">
          </div>
          <div class="form-field-group">
            <label>Clinic Phone &amp; Secure Fax / EHR:</label>
            <input type="text" id="clinician_contact" class="form-input" placeholder="Phone: (555) 234-5678 | Fax: (555) 234-5679">
          </div>
        </div>

        <!-- Section 2: Clinical Summary & Reason for Consultation -->
        <div class="form-section-box">
          <div class="section-box-title">CLINICAL SUMMARY &amp; REASON FOR CONSULTATION</div>
          <p class="section-field-static" style="margin-bottom: 6px;">
            Patient is currently engaged in outpatient mental health evaluation / psychotherapy for presenting symptoms of:
            <strong>${safeName}</strong>. Given the presence of atypical features, treatment refractoriness, or physiological symptoms, a comprehensive medical rule-out is requested to exclude underlying organic, endocrine, metabolic, or neurological contributors before finalizing long-term psychiatric management.
          </p>
          ${FormDrawerManager.renderIcdSelector(disorder.icd10)}

          <div class="section-box-title" style="margin-top: 10px;">OBJECTIVE CLINICAL INDICATORS &amp; RED FLAGS OBSERVED</div>
          <div class="form-grid-2col" style="gap: 6px;">
            <div class="checkbox-stack">
              <label class="form-checkbox-label"><input type="checkbox" name="consult_indicators" value="Atypical Age of Onset"><span>[ ] Atypical Age of Onset (e.g. Age &gt; 45 without prior history)</span></label>
              <label class="form-checkbox-label"><input type="checkbox" name="consult_indicators" value="Autonomic Signs"><span>[ ] Autonomic Signs (Labile BP, unexplained tachycardia, diaphoresis)</span></label>
              <label class="form-checkbox-label"><input type="checkbox" name="consult_indicators" value="Neurological Signs"><span>[ ] Neurological Signs (Gait ataxia, tremor, cognitive fluctuations, auras)</span></label>
            </div>
            <div class="checkbox-stack">
              <label class="form-checkbox-label"><input type="checkbox" name="consult_indicators" value="Somatic Signs"><span>[ ] Somatic Signs (Unexplained weight changes, profound fatigue, cold intolerance)</span></label>
              <label class="form-checkbox-label"><input type="checkbox" name="consult_indicators" value="Treatment Refractory"><span>[ ] Treatment Refractory (Minimal response to standard psychotherapy/pharmacotherapy)</span></label>
              <label class="form-checkbox-label"><input type="checkbox" name="consult_indicators" value="Medication Reaction"><span>[ ] Suspected Adverse Drug Reaction or Discontinuation State</span></label>
            </div>
          </div>
        </div>

        <!-- Section 3: Diagnostic Workup Recommendations -->
        <div class="form-section-box">
          <div class="section-box-title">COLLABORATIVE DIAGNOSTIC EVALUATION REQUESTED</div>
          <p style="font-size: 11px; margin-bottom: 6px;">To assist in establishing diagnostic clarity, please consider ordering the following tiered workups:</p>
          
          <div class="workup-recommendations-list">
            <label class="form-checkbox-label">
              <input type="checkbox" name="consult_labs" value="Tier 1 Baseline Panel" checked>
              <span><strong>Tier 1 Baseline Laboratory Panel:</strong> CBC with differential, Comprehensive Metabolic Panel (CMP), Serum TSH with Free T4, Urinalysis, Urine Drug Screen</span>
            </label>
            <label class="form-checkbox-label">
              <input type="checkbox" name="consult_labs" value="Tier 2 Targeted Testing" checked>
              <span><strong>Tier 2 Targeted Differential Testing:</strong> ${FormDrawerManager.escape(tier2LabSummary)}</span>
            </label>

            <!-- Selectable Specialist Consideration Checkboxes (Revision 8) -->
            <div class="specialist-consult-block" style="margin-top: 10px; padding-top: 8px; border-top: 1px solid #cbd5e1;">
              <div style="font-size: 11px; font-weight: bold; margin-bottom: 6px; color: #1e293b;">Specialist Referral Consideration (Select all that apply):</div>
              <div class="specialist-checkbox-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                <label class="form-checkbox-label">
                  <input type="checkbox" name="consult_specialists" value="Neurology">
                  <span>[ ] Neurology</span>
                </label>
                <label class="form-checkbox-label">
                  <input type="checkbox" name="consult_specialists" value="Endocrinology">
                  <span>[ ] Endocrinology</span>
                </label>
                <label class="form-checkbox-label">
                  <input type="checkbox" name="consult_specialists" value="Sleep Medicine (Polysomnography)">
                  <span>[ ] Sleep Medicine (Polysomnography)</span>
                </label>
                <label class="form-checkbox-label">
                  <input type="checkbox" name="consult_specialists" value="Rheumatology / Immunology">
                  <span>[ ] Rheumatology / Immunology</span>
                </label>
                <label class="form-checkbox-label">
                  <input type="checkbox" name="consult_specialists" value="Toxicology / Addiction Medicine">
                  <span>[ ] Toxicology / Addiction Medicine</span>
                </label>
                <label class="form-checkbox-label">
                  <input type="checkbox" name="consult_specialists" value="Cardiology / Autonomic Assessment">
                  <span>[ ] Cardiology / Autonomic Assessment</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Section 4: Signature -->
        <div class="form-signature-block">
          <div class="sig-line">
            <div class="sig-underline"></div>
            <div class="sig-caption">Referring Clinician Signature</div>
          </div>
          <div class="sig-line">
            <div class="sig-underline"></div>
            <div class="sig-caption">State License Number &amp; Date</div>
          </div>
        </div>

        <div class="form-notice-italic">
          Thank you for your collaborative partnership in ensuring safe, comprehensive patient care. Please transmit consultation notes and lab reports to the secure fax/portal indicated above.
        </div>

        <!-- Interactive Form Control Buttons -->
        <div class="form-controls-bar no-print">
          <button type="button" class="btn-ctrl btn-ctrl-print" id="btn-print-form">
            🖨️ Print Letter / Save as PDF
          </button>
          <button type="button" class="btn-ctrl btn-ctrl-copy" id="btn-copy-form-text">
            📋 Copy EHR Note
          </button>
          <button type="button" class="btn-ctrl btn-ctrl-close" id="btn-close-form">
            ✕ Close
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Wire interactive events inside modal
   */
  attachFormEvents(container) {
    const printBtn = container.querySelector('#btn-print-form');
    const copyBtn = container.querySelector('#btn-copy-form-text');
    const closeBtn = container.querySelector('#btn-close-form');

    if (printBtn) {
      printBtn.addEventListener('click', () => {
        window.print();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.closeForm();
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        this.copyFormToClipboard(container);
      });
    }
  }

  /**
   * Copy formatted plain text progress note to clipboard
   */
  copyFormToClipboard(container) {
    let noteText = '';
    const isCrisis = this.activeFormType === 'crisis';

    // Extract selected ICD codes
    const checkedIcd = Array.from(container.querySelectorAll('input[name="form_icd_subcodes"]:checked'))
      .map(el => el.value);
    const singleIcd = container.querySelector('input[name="form_single_icd"]')?.value;
    let icdSummary = '';
    if (checkedIcd.length > 0) {
      icdSummary = checkedIcd.join(', ');
    } else if (singleIcd) {
      icdSummary = singleIcd;
    } else {
      icdSummary = 'Unspecified / Pending Clinical Determination';
    }

    if (isCrisis) {
      const patient = container.querySelector('#patient_name')?.value || 'Not Specified';
      const dob = container.querySelector('#patient_dob')?.value || 'Not Specified';
      const transferTime = container.querySelector('#transfer_time')?.value || '';
      const ed = container.querySelector('#receiving_ed')?.value || 'Emergency Dept';
      const clinician = container.querySelector('#clinician_name')?.value || 'Referring Clinician';
      const phone = container.querySelector('#clinician_phone')?.value || '';
      const meds = container.querySelector('#patient_meds')?.value || 'None documented';
      const mimics = container.querySelector('#suspected_mimics')?.value || '';
      const notes = container.querySelector('#additional_notes')?.value || '';

      const checkedRedFlags = Array.from(container.querySelectorAll('input[name="crisis_red_flags"]:checked'))
        .map(el => `- ${el.value}`)
        .join('\n');

      noteText = `=== URGENT CRISIS TRANSFER & ACUTE MEDICAL CLEARANCE ===
Date/Time: ${transferTime}
Patient: ${patient} | DOB: ${dob}
Receiving Facility: ${ed}
Referring Clinician: ${clinician} (${phone})

PRIMARY PRESENTATION:
${this.activeDisorder?.name} (ICD-10: ${icdSummary})

OBSERVED ACUTE RED FLAGS:
${checkedRedFlags || '- None specified'}

SUSPECTED ORGANIC MIMICS TO RULE OUT:
${mimics}

KNOWN MEDICATIONS / SUBSTANCES:
${meds}

CLINICAL DIRECTIVE & ORDERS REQUESTED:
${notes}
`;
    } else {
      const physician = container.querySelector('#consult_physician')?.value || 'Physician';
      const specialty = container.querySelector('#consult_specialty')?.value || 'General Medicine';
      const patient = container.querySelector('#patient_name')?.value || 'Patient';
      const dobMrn = container.querySelector('#patient_dob_mrn')?.value || '';
      const clinician = container.querySelector('#clinician_name')?.value || 'Referring Clinician';
      const contact = container.querySelector('#clinician_contact')?.value || '';

      const checkedIndicators = Array.from(container.querySelectorAll('input[name="consult_indicators"]:checked'))
        .map(el => `- ${el.value}`)
        .join('\n');

      const checkedLabs = Array.from(container.querySelectorAll('input[name="consult_labs"]:checked'))
        .map(el => `- ${el.value}`)
        .join('\n');

      const checkedSpecialists = Array.from(container.querySelectorAll('input[name="consult_specialists"]:checked'))
        .map(el => `- Specialist Referral: ${el.value}`)
        .join('\n');

      noteText = `=== OUTPATIENT CLINICAL CONSULTATION & MEDICAL RULE-OUT REQUEST ===
To: ${physician} (${specialty})
Patient: ${patient} | ${dobMrn}
From: ${clinician} | ${contact}

REASON FOR CONSULTATION:
Evaluation of presenting psychiatric symptoms of ${this.activeDisorder?.name} (ICD-10: ${icdSummary}).
Medical rule-out requested to exclude organic, endocrine, metabolic, or neurological contributors.

OBSERVED CLINICAL INDICATORS:
${checkedIndicators || '- Standard evaluation'}

COLLABORATIVE WORKUP REQUESTED:
${checkedLabs}
${checkedSpecialists ? '\nSPECIALIST REFERRALS REQUESTED:\n' + checkedSpecialists : ''}

Please return consultation notes and diagnostic findings via secure communication.
`;
    }

    navigator.clipboard.writeText(noteText).then(() => {
      const originalText = copyBtn ? copyBtn.innerText : '';
      if (copyBtn) copyBtn.innerText = '✅ Copied to Clipboard!';
      setTimeout(() => {
        if (copyBtn) copyBtn.innerText = originalText;
      }, 2500);
    }).catch(err => {
      alert('Could not auto-copy. Please select and copy text manually.');
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FormDrawerManager;
}
