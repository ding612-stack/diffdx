/**
 * Application Coordinator for Clinical Differential Diagnosis Engine PWA
 */

(function () {
  'use strict';

  // Instantiate application core services
  const searchEngine = new DifferentialSearchEngine();
  const formDrawer = new FormDrawerManager();

  // DOM Elements
  const searchInput = document.getElementById('search-input');
  const btnClear = document.getElementById('btn-clear');
  const searchForm = document.getElementById('search-form');
  const resultsCountLabel = document.getElementById('results-count-label');
  const resultsList = document.getElementById('results-list');
  const facetCategory = document.getElementById('facet-category');
  const facetDiscipline = document.getElementById('facet-discipline');
  const btnResetFacets = document.getElementById('btn-reset-facets');
  const toggleSyntaxGuide = document.getElementById('toggle-syntax-guide');
  const syntaxGuideBox = document.getElementById('syntax-guide-box');

  // Modals
  const wikiModal = document.getElementById('wiki-modal-backdrop');
  const wikiContent = document.getElementById('wiki-modal-content');
  const btnCloseWiki = document.getElementById('btn-close-wiki');

  const mimicModal = document.getElementById('mimic-modal-backdrop');
  const mimicContent = document.getElementById('mimic-modal-content');
  const btnCloseMimic = document.getElementById('btn-close-mimic');

  const disclaimerModal = document.getElementById('disclaimer-modal-backdrop');
  const btnCloseDisclaimer = document.getElementById('btn-close-disclaimer');
  const btnOpenDisclaimer = document.getElementById('btn-open-disclaimer');
  const btnAcceptDisclaimer = document.getElementById('btn-accept-disclaimer');
  const chkDontShowDisclaimer = document.getElementById('chk-dont-show-disclaimer');

  // Current State
  let currentQuery = '';
  let activeFilters = {
    category: 'all',
    discipline: 'all',
    tier: 'all'
  };
  let currentSearchResults = null;

  /**
   * Bootstrapping: Load clinical datasets and initialize components
   */
  async function initApp() {
    try {
      resultsCountLabel.innerHTML = 'Loading clinical diagnostic databases...';

      const [disordersRes, mimicsRes] = await Promise.all([
        fetch('data/disorders.json'),
        fetch('data/mimics.json')
      ]);

      if (!disordersRes.ok || !mimicsRes.ok) {
        throw new Error('Failed to load clinical datasets.');
      }

      const disordersData = await disordersRes.json();
      const mimicsData = await mimicsRes.json();

      searchEngine.init(disordersData, mimicsData);

      // Populate Sidebar Facet Dropdowns
      populateFacets();

      // Register Event Listeners
      setupEventListeners();

      // Check URL hash for initial query or disorder navigation
      handleUrlHash();

      // Check Clinical Disclaimer acceptance
      checkDisclaimerModal();

      // Initial Search / Catalog Render
      executeSearch();

      // Register PWA Service Worker for offline capability
      registerServiceWorker();

    } catch (err) {
      console.error('Initialization error:', err);
      resultsCountLabel.innerHTML = `<span style="color: #dc2626;">Error initializing diagnostic engine: ${err.message}</span>`;
    }
  }

  /**
   * Populate Category & Discipline Select Elements
   */
  function populateFacets() {
    if (!searchEngine.isReady) return;

    // Categories
    facetCategory.innerHTML = '<option value="all">All Diagnostic Chapters</option>';
    searchEngine.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      facetCategory.appendChild(opt);
    });

    // Disciplines
    facetDiscipline.innerHTML = '<option value="all">All Medical Disciplines</option>';
    searchEngine.disciplines.forEach(disc => {
      const opt = document.createElement('option');
      opt.value = disc;
      opt.textContent = disc;
      facetDiscipline.appendChild(opt);
    });
  }

  /**
   * Perform Search and Update Results View
   */
  function executeSearch() {
    currentQuery = searchInput.value.trim();
    btnClear.style.display = currentQuery.length > 0 ? 'block' : 'none';

    // Collect active filters
    activeFilters.tier = 'all';
    activeFilters.category = facetCategory.value;
    activeFilters.discipline = facetDiscipline.value;

    const outcome = searchEngine.search(currentQuery, activeFilters);
    currentSearchResults = outcome;
    renderResults(outcome);
  }

  /**
   * Render Search Results List
   */
  function renderResults(outcome) {
    const { results, total, queryType, fallback, positiveTerms } = outcome;

    if (total === 0) {
      resultsCountLabel.innerHTML = `No matching disorders found for <strong>"${WikiArticleRenderer.escapeHTML(currentQuery)}"</strong>.`;
      resultsList.innerHTML = `
        <div class="empty-state" style="background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 36px; text-align: center;">
          <div style="font-size: 2rem; margin-bottom: 8px;">🔍</div>
          <h3 style="color: #1e293b; margin-bottom: 6px;">No Diagnostic Overlap Found</h3>
          <p style="color: #64748b; font-size: 0.9rem; max-width: 480px; margin: 0 auto 16px auto;">
            Try broadening your search query, using OR instead of AND, or removing quotation marks.
          </p>
          <button type="button" class="btn-card-action btn-view-monograph" id="btn-browse-all">Browse Complete Catalog</button>
        </div>
      `;
      const btnBrowseAll = document.getElementById('btn-browse-all');
      if (btnBrowseAll) {
        btnBrowseAll.addEventListener('click', () => {
          searchInput.value = '';
          resetAllFilters();
        });
      }
      return;
    }

    // Update results meta summary
    let metaText = '';
    if (queryType === 'catalog') {
      metaText = `Displaying all <strong>${total}</strong> diagnostic desk reference entries`;
    } else {
      metaText = `Found <strong>${total}</strong> differential diagnoses for <em>"${WikiArticleRenderer.escapeHTML(currentQuery)}"</em>`;
      if (fallback) {
        metaText += ` <span style="font-size: 0.8rem; color: #d97706; margin-left: 6px;">(Showing ranked partial associations)</span>`;
      }
    }
    resultsCountLabel.innerHTML = metaText;

    // Build Cards HTML
    const cardsHTML = results.map(item => {
      const d = item.disorder;
      const safeName = WikiArticleRenderer.escapeHTML(d.name);
      const safeCat = WikiArticleRenderer.escapeHTML(d.category);
      const safeIcd10 = WikiArticleRenderer.escapeHTML(d.icd10 || 'Unassigned');
      
      // Highlight symptoms snippet
      const snippet = d.symptoms.length > 220 ? d.symptoms.substring(0, 220) + '...' : d.symptoms;
      const highlightedSnippet = WikiArticleRenderer.highlightTerms(snippet, positiveTerms);

      // Top 3 mimics preview
      let mimicsPreviewHTML = '';
      if (Array.isArray(d.differentials) && d.differentials.length > 0) {
        const topMimics = d.differentials.slice(0, 3).map(diff => 
          `<span class="mimic-mini-pill">${WikiArticleRenderer.escapeHTML(diff.mimic)}</span>`
        ).join('');
        mimicsPreviewHTML = `
          <div class="card-mimics-preview">
            <span class="card-mimics-label">Key Rule-Out Mimics:</span>
            ${topMimics}
          </div>
        `;
      }

      return `
        <article class="result-card" data-disorder-index="${d.index}">
          <div class="result-card-header">
            <div>
              <a href="#disorder-${d.index}" class="result-title-link" data-action="open-wiki" data-disorder-index="${d.index}">
                ${safeName}
              </a>
              <div class="result-meta-row" style="margin-top: 4px;">
                <span class="result-category">${safeCat}</span>
                <span class="result-icd">ICD-10: ${safeIcd10}</span>
                <span>• Disorder #${d.index}</span>
              </div>
            </div>
          </div>

          <p class="result-symptoms-snippet">${highlightedSnippet}</p>
          ${mimicsPreviewHTML}

          <div class="result-card-actions">
            <button type="button" class="btn-card-action btn-view-monograph" data-action="open-wiki" data-disorder-index="${d.index}">
              Full Monograph
            </button>
            <button type="button" class="btn-card-action btn-card-crisis" data-action="crisis-form" data-disorder-index="${d.index}">
              🚨 Draft Emergency Transfer
            </button>
            <button type="button" class="btn-card-action btn-card-consult" data-action="consult-form" data-disorder-index="${d.index}">
              📋 Draft Rule-Out Request
            </button>
          </div>
        </article>
      `;
    }).join('');

    resultsList.innerHTML = cardsHTML;
  }

  /**
   * Open Wikipedia Monograph Modal for a Disorder
   */
  function openDisorderMonograph(disorderIndex) {
    const disorder = searchEngine.disorders.find(d => String(d.index) === String(disorderIndex));
    if (!disorder) return;

    const positiveTerms = currentSearchResults?.positiveTerms || [];
    wikiContent.innerHTML = WikiArticleRenderer.renderDisorder(disorder, positiveTerms);
    wikiModal.classList.add('active');
    document.body.classList.add('modal-open');

    // Update URL hash without reload
    window.location.hash = `disorder-${disorder.index}`;
  }

  /**
   * Close Wikipedia Modal
   */
  function closeDisorderMonograph() {
    wikiModal.classList.remove('active');
    document.body.classList.remove('modal-open');
    if (window.location.hash.startsWith('#disorder-')) {
      history.pushState('', document.title, window.location.pathname + window.location.search);
    }
  }

  /**
   * Open Canonical Medical Mimic Dossier Modal
   */
  function openMimicDossier(mimicName) {
    if (!mimicName) return;
    const cleanName = mimicName.toLowerCase();
    
    // Attempt exact or fuzzy lookup
    let mimic = searchEngine.mimicMap.get(cleanName);
    if (!mimic) {
      const candidates = searchEngine.searchMimics(mimicName);
      if (candidates.length > 0) mimic = candidates[0];
    }

    if (!mimic) {
      // Create fallback profile from name
      mimic = {
        name: mimicName,
        discipline: 'Internal Medicine / Diagnostic Pathology',
        icd10: 'See Specialist Workup',
        systemic_symptoms: 'Non-psychiatric organic medical mimic associated with secondary psychiatric symptomatology.',
        physical_signs: 'Perform targeted neurological, endocrine, or metabolic physical examination.',
        diagnostic_workup: 'Complete blood count (CBC), comprehensive metabolic panel (CMP), targeted endocrine assays, and specialist consultation.'
      };
    }

    mimicContent.innerHTML = WikiArticleRenderer.renderMimicDossier(mimic);
    mimicModal.classList.add('active');
  }

  /**
   * Close Mimic Modal
   */
  function closeMimicDossier() {
    mimicModal.classList.remove('active');
  }

  /**
   * Reset all filters to default
   */
  function resetAllFilters() {
    facetCategory.value = 'all';
    facetDiscipline.value = 'all';
    executeSearch();
  }

  /**
   * Handle deep-linking via URL hash
   */
  function handleUrlHash() {
    const hash = window.location.hash;
    if (hash.startsWith('#disorder-')) {
      const index = hash.replace('#disorder-', '');
      openDisorderMonograph(index);
    }
  }

  /**
   * Clinical Decision Support Disclaimer Handlers
   */
  function checkDisclaimerModal() {
    try {
      const accepted = localStorage.getItem('diffdx_disclaimer_accepted_v1');
      if (accepted !== 'true') {
        openDisclaimerModal();
      }
    } catch (e) {
      // LocalStorage blocked/private mode: open modal safely
      openDisclaimerModal();
    }
  }

  function openDisclaimerModal() {
    if (disclaimerModal) {
      disclaimerModal.classList.add('active');
    }
  }

  function closeDisclaimerModal() {
    if (disclaimerModal) {
      disclaimerModal.classList.remove('active');
    }
  }

  /**
   * Register Event Listeners
   */
  function setupEventListeners() {
    // Unsaved changes guard: Prevent accidental tab closing/refreshing
    window.addEventListener('beforeunload', (e) => {
      if (formDrawer && typeof formDrawer.hasUnsavedChanges === 'function' && formDrawer.hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // Clinical Disclaimer actions
    if (btnOpenDisclaimer) {
      btnOpenDisclaimer.addEventListener('click', openDisclaimerModal);
    }
    if (btnCloseDisclaimer) {
      btnCloseDisclaimer.addEventListener('click', closeDisclaimerModal);
    }
    if (btnAcceptDisclaimer) {
      btnAcceptDisclaimer.addEventListener('click', () => {
        if (chkDontShowDisclaimer && chkDontShowDisclaimer.checked) {
          try {
            localStorage.setItem('diffdx_disclaimer_accepted_v1', 'true');
          } catch (e) {}
        }
        closeDisclaimerModal();
      });
    }

    // Search form submission
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      executeSearch();
    });

    // Real-time search with input
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        executeSearch();
      }, 200);
    });

    // Clear search button
    btnClear.addEventListener('click', () => {
      searchInput.value = '';
      executeSearch();
      searchInput.focus();
    });

    // Search hint chips
    document.querySelectorAll('.hint-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const query = chip.getAttribute('data-query');
        searchInput.value = query;
        executeSearch();
      });
    });

    // Syntax Guide Toggle
    toggleSyntaxGuide.addEventListener('click', () => {
      syntaxGuideBox.classList.toggle('visible');
    });

    // Facet Dropdown Changes
    facetCategory.addEventListener('change', executeSearch);
    facetDiscipline.addEventListener('change', executeSearch);

    // Reset Filters Button
    btnResetFacets.addEventListener('click', resetAllFilters);

    // Event Delegation: Results List clicks
    resultsList.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.getAttribute('data-action');
      const disorderIndex = target.getAttribute('data-disorder-index');
      const disorder = searchEngine.disorders.find(d => String(d.index) === String(disorderIndex));

      if (action === 'open-wiki') {
        e.preventDefault();
        openDisorderMonograph(disorderIndex);
      } else if (action === 'crisis-form') {
        if (disorder) formDrawer.openForm(disorder, 'crisis');
      } else if (action === 'consult-form') {
        if (disorder) formDrawer.openForm(disorder, 'consult');
      }
    });

    // Event Delegation: Wikipedia Modal internal clicks (TOC, mimic lookup, action buttons)
    wikiContent.addEventListener('click', (e) => {
      // Lookup Mimic Dossier
      const mimicBtn = e.target.closest('.btn-mimic-dossier');
      if (mimicBtn) {
        const mimicName = mimicBtn.getAttribute('data-mimic-name');
        openMimicDossier(mimicName);
        return;
      }

      // Crisis or Consult Action Buttons inside Wikipedia Article
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        const action = actionBtn.getAttribute('data-action');
        const disorderIndex = actionBtn.getAttribute('data-disorder-index');
        const disorder = searchEngine.disorders.find(d => String(d.index) === String(disorderIndex));
        if (!disorder) return;

        if (action === 'crisis-form') {
          formDrawer.openForm(disorder, 'crisis');
        } else if (action === 'consult-form') {
          formDrawer.openForm(disorder, 'consult');
        }
      }
    });

    // Close Modal buttons
    btnCloseWiki.addEventListener('click', closeDisorderMonograph);
    btnCloseMimic.addEventListener('click', closeMimicDossier);

    // Close modal on backdrop click
    wikiModal.addEventListener('click', (e) => {
      if (e.target === wikiModal) closeDisorderMonograph();
    });
    mimicModal.addEventListener('click', (e) => {
      if (e.target === mimicModal) closeMimicDossier();
    });
    if (disclaimerModal) {
      disclaimerModal.addEventListener('click', (e) => {
        if (e.target === disclaimerModal) closeDisclaimerModal();
      });
    }

    // Keyboard ESC to close modals
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (disclaimerModal && disclaimerModal.classList.contains('active')) {
          closeDisclaimerModal();
        } else if (mimicModal.classList.contains('active')) {
          closeMimicDossier();
        } else if (wikiModal.classList.contains('active')) {
          closeDisorderMonograph();
        } else {
          formDrawer.closeForm();
        }
      }
    });

    // Window Popstate / Hashchange
    window.addEventListener('hashchange', handleUrlHash);
  }

  /**
   * Register Service Worker for Offline PWA Functionality
   */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(registration => {
          console.log('DifferentialDx ServiceWorker registered with scope:', registration.scope);
        }).catch(err => {
          console.log('ServiceWorker registration omitted or failed:', err);
        });
      });
    }
  }

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
