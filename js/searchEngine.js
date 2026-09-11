/**
 * Search and Differential Diagnosis Engine
 * Handles in-memory inverted index, Boolean AST evaluation,
 * graduated fit scoring (Best Fit, Moderate Fit, Loose Association),
 * and faceted filtering.
 */

/**
 * Clinical Acronym & Synonym Resolution Map
 * Maps common medical/psychiatric abbreviations to canonical disorder and mimic names
 */
const CLINICAL_ACRONYMS = {
  'adhd': ['attention-deficit/hyperactivity disorder', 'attention deficit'],
  'add': ['attention-deficit/hyperactivity disorder', 'attention deficit'],
  'mdd': ['major depressive disorder'],
  'bpd': ['borderline personality disorder', 'borderline'],
  'bd': ['bipolar disorder', 'bipolar i', 'bipolar ii'],
  'bpad': ['bipolar disorder', 'bipolar affective disorder', 'bipolar i', 'bipolar ii'],
  'gad': ['generalized anxiety disorder'],
  'ptsd': ['posttraumatic stress disorder', 'post-traumatic stress'],
  'ocd': ['obsessive-compulsive disorder'],
  'asd': ['autism spectrum disorder'],
  'sad': ['social anxiety disorder', 'seasonal affective disorder'],
  'did': ['dissociative identity disorder'],
  'pmdd': ['premenstrual dysphoric disorder'],
  'pdd': ['persistent depressive disorder'],
  'odd': ['oppositional defiant disorder'],
  'ied': ['intermittent explosive disorder'],
  'cd': ['conduct disorder'],
  'pd': ['panic disorder', 'parkinson'],
  'iad': ['illness anxiety disorder'],
  'ssd': ['somatic symptom disorder'],
  'an': ['anorexia nervosa'],
  'bn': ['bulimia nervosa'],
  'bed': ['binge-eating disorder', 'binge eating'],
  'arfid': ['avoidant/restrictive food intake disorder'],
  'osa': ['obstructive sleep apnea', 'sleep apnea'],
  'uars': ['upper airway resistance syndrome'],
  'sud': ['substance-related and addictive disorders', 'substance use'],
  'aud': ['alcohol use disorder', 'alcohol use'],
  'cud': ['cannabis use disorder'],
  'oud': ['opioid use disorder'],
  'nms': ['neuroleptic malignant syndrome', 'neuroleptic-induced'],
  'ss': ['serotonin syndrome'],
  'mci': ['mild neurocognitive disorder'],
  'ad': ['alzheimer', 'major neurocognitive disorder due to alzheimer'],
  'hd': ['huntington'],
  'tbi': ['traumatic brain injury'],
  'pku': ['phenylketonuria'],
  'fasd': ['fetal alcohol spectrum disorder'],
  'fxs': ['fragile x syndrome'],
  'ds': ['down syndrome'],
  'sle': ['systemic lupus erythematosus'],
  'he': ['hashimoto'],
  'tle': ['temporal lobe epilepsy'],
  'psvt': ['paroxysmal supraventricular tachycardia'],
  'svt': ['supraventricular tachycardia'],
  'pcos': ['polycystic ovary syndrome'],
  'cs': ['cushing'],
  'ai': ['adrenal insufficiency', 'addison']
};

class DifferentialSearchEngine {
  constructor() {
    this.disorders = [];
    this.mimics = [];
    this.mimicMap = new Map();
    this.categories = [];
    this.disciplines = [];
    this.isReady = false;
  }

  /**
   * Initialize with disorders and mimics arrays
   */
  init(disordersData, mimicsData) {
    this.disorders = Array.isArray(disordersData) ? disordersData : [];
    this.mimics = Array.isArray(mimicsData) ? mimicsData : [];
    
    // Build quick lookup map for canonical medical mimics
    this.mimicMap.clear();
    this.mimics.forEach(m => {
      if (m.id) this.mimicMap.set(m.id.toLowerCase(), m);
      if (m.name) this.mimicMap.set(m.name.toLowerCase(), m);
    });

    // Extract unique categories & disciplines
    const catSet = new Set();
    const discSet = new Set();

    this.disorders.forEach(d => {
      if (d.category) catSet.add(d.category);
      if (Array.isArray(d.differentials)) {
        d.differentials.forEach(diff => {
          if (diff.discipline) {
            // Disciplines often have slashes e.g. "Genetics / Endocrinology"
            diff.discipline.split('/').forEach(part => discSet.add(part.trim()));
          }
        });
      }
    });

    this.categories = Array.from(catSet).sort();
    this.disciplines = Array.from(discSet).filter(Boolean).sort();
    this.isReady = true;
  }

  /**
   * Evaluate a single field against a search term with exact substring and morphological stemming
   */
  static matchFieldValue(fieldValue, term, isPhrase) {
    if (!fieldValue || !term) return false;
    const str = (typeof fieldValue === 'string' ? fieldValue : JSON.stringify(fieldValue)).toLowerCase();
    
    // 1. Exact phrase or substring match
    if (str.includes(term)) {
      return true;
    }

    // 2. Morphological stem matching (for single words >= 4 chars)
    if (!isPhrase && term.length >= 4 && !term.includes(' ')) {
      let Stemmer = null;
      if (typeof ClinicalStemmer !== 'undefined') {
        Stemmer = ClinicalStemmer;
      } else if (typeof require !== 'undefined') {
        try {
          const mod = require('./parser.js');
          Stemmer = mod.ClinicalStemmer || mod;
        } catch (e) {}
      }

      if (Stemmer && typeof Stemmer.stem === 'function') {
        const stemmedTerm = Stemmer.stem(term);
        if (stemmedTerm && stemmedTerm.length >= 3) {
          // Tokenize document words and check for stem equivalence
          const docWords = str.split(/[^a-zA-Z0-9]+/);
          for (let i = 0; i < docWords.length; i++) {
            const dw = docWords[i];
            if (dw.length >= 3) {
              if (dw.startsWith(stemmedTerm) || Stemmer.stem(dw) === stemmedTerm) {
                return true;
              }
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Check if query term matches a recognized clinical acronym or abbreviation
   * Returns 2 for direct primary disorder name match, 1 for secondary differential mention, 0 for none.
   */
  static matchesAcronym(term, disorder) {
    if (!term || !disorder) return 0;
    const cleanTerm = term.toLowerCase().replace(/[^a-z0-9]/g, '');
    const targets = CLINICAL_ACRONYMS[cleanTerm];
    if (!targets) return 0;

    const dName = (disorder.name || '').toLowerCase();
    for (let i = 0; i < targets.length; i++) {
      const tgt = targets[i];
      if (dName.includes(tgt)) {
        return 2; // Direct primary disorder name match
      }
    }

    // Check differentials and mimics
    if (Array.isArray(disorder.differentials)) {
      for (let i = 0; i < targets.length; i++) {
        const tgt = targets[i];
        const mimicHit = disorder.differentials.some(diff => 
          (diff.mimic && (diff.mimic.toLowerCase().includes(tgt) || diff.mimic.toLowerCase().includes(cleanTerm))) ||
          (diff.overlap && diff.overlap.toLowerCase().includes(cleanTerm))
        );
        if (mimicHit) return 1;
      }
    }
    return 0;
  }

  /**
   * Check if a disorder satisfies a Boolean AST node
   */
  evaluateNode(node, disorder) {
    if (!node) return true;

    if (node.type === 'AND') {
      return this.evaluateNode(node.left, disorder) && this.evaluateNode(node.right, disorder);
    }

    if (node.type === 'OR') {
      return this.evaluateNode(node.left, disorder) || this.evaluateNode(node.right, disorder);
    }

    if (node.type === 'NOT') {
      return !this.evaluateNode(node.operand, disorder);
    }

    if (node.type === 'TERM') {
      const term = node.value;
      const isPhrase = !!node.isPhrase;
      const field = node.field || 'all';

      switch (field) {
        case 'symptoms':
          return DifferentialSearchEngine.matchFieldValue(disorder.symptoms, term, isPhrase) ||
                 (disorder.differentials && disorder.differentials.some(d => DifferentialSearchEngine.matchFieldValue(d.overlap, term, isPhrase)));

        case 'mimic':
          return disorder.differentials && disorder.differentials.some(d => 
            DifferentialSearchEngine.matchFieldValue(d.mimic, term, isPhrase) ||
            DifferentialSearchEngine.matchFieldValue(d.discipline, term, isPhrase)
          );

        case 'workup':
          return disorder.differentials && disorder.differentials.some(d => 
            DifferentialSearchEngine.matchFieldValue(d.workup, term, isPhrase)
          );

        case 'physical_signs':
          return disorder.differentials && disorder.differentials.some(d => 
            DifferentialSearchEngine.matchFieldValue(d.physical_signs, term, isPhrase)
          );

        case 'icd':
          return DifferentialSearchEngine.matchFieldValue(disorder.icd10, term, isPhrase) ||
                 DifferentialSearchEngine.matchFieldValue(disorder.icd11, term, isPhrase);

        case 'category':
          return DifferentialSearchEngine.matchFieldValue(disorder.category, term, isPhrase);

        case 'red_flags':
          return Array.isArray(disorder.red_flags) && disorder.red_flags.some(rf => 
            DifferentialSearchEngine.matchFieldValue(rf, term, isPhrase)
          );

        case 'all':
        default:
          // Check clinical acronym / abbreviation alias
          if (DifferentialSearchEngine.matchesAcronym(term, disorder)) return true;

          // Check across all standard fields
          if (DifferentialSearchEngine.matchFieldValue(disorder.name, term, isPhrase)) return true;
          if (DifferentialSearchEngine.matchFieldValue(disorder.category, term, isPhrase)) return true;
          if (DifferentialSearchEngine.matchFieldValue(disorder.icd10, term, isPhrase)) return true;
          if (DifferentialSearchEngine.matchFieldValue(disorder.icd11, term, isPhrase)) return true;
          if (DifferentialSearchEngine.matchFieldValue(disorder.symptoms, term, isPhrase)) return true;
          if (Array.isArray(disorder.red_flags) && disorder.red_flags.some(rf => DifferentialSearchEngine.matchFieldValue(rf, term, isPhrase))) return true;
          if (Array.isArray(disorder.differentials)) {
            return disorder.differentials.some(d => 
              DifferentialSearchEngine.matchFieldValue(d.mimic, term, isPhrase) ||
              DifferentialSearchEngine.matchFieldValue(d.discipline, term, isPhrase) ||
              DifferentialSearchEngine.matchFieldValue(d.overlap, term, isPhrase) ||
              DifferentialSearchEngine.matchFieldValue(d.physical_signs, term, isPhrase) ||
              DifferentialSearchEngine.matchFieldValue(d.workup, term, isPhrase)
            );
          }
          return false;
      }
    }

    return false;
  }

  /**
   * Compute relevance score and match breakdown for a disorder given positive query terms
   */
  computeScore(disorder, positiveTerms) {
    if (!positiveTerms || !positiveTerms.length) {
      return { score: 10, termHitCount: 0, matchedFields: [] };
    }

    let score = 0;
    let hitCount = 0;
    const matchedFields = new Set();

    positiveTerms.forEach(t => {
      const val = t.value;
      const isPhrase = t.isPhrase;
      let termMatchedInDoc = false;

      // Clinical Acronym match bonus (e.g. ADHD, MDD, BPD, GAD, PTSD, OCD)
      const acronymTier = DifferentialSearchEngine.matchesAcronym(val, disorder);
      if (acronymTier === 2) {
        score += 150; // Decisive primary target disorder match
        termMatchedInDoc = true;
        matchedFields.add('Primary Disorder Match');
      } else if (acronymTier === 1) {
        score += 40;
        termMatchedInDoc = true;
        matchedFields.add('Differential Overlap');
      }

      // Disorder Name match
      if (DifferentialSearchEngine.matchFieldValue(disorder.name, val, isPhrase)) {
        score += 45;
        termMatchedInDoc = true;
        matchedFields.add('Disorder Name');
      }

      // ICD Code match
      if (DifferentialSearchEngine.matchFieldValue(disorder.icd10, val, isPhrase) ||
          DifferentialSearchEngine.matchFieldValue(disorder.icd11, val, isPhrase)) {
        score += 35;
        termMatchedInDoc = true;
        matchedFields.add('ICD Code');
      }

      // Symptoms match (Core Criteria)
      if (DifferentialSearchEngine.matchFieldValue(disorder.symptoms, val, isPhrase)) {
        score += 30;
        termMatchedInDoc = true;
        matchedFields.add('DSM Criteria / Symptoms');
      }

      // Category match
      if (DifferentialSearchEngine.matchFieldValue(disorder.category, val, isPhrase)) {
        score += 15;
        termMatchedInDoc = true;
        matchedFields.add('Diagnostic Category');
      }

      // Red Flags match
      if (Array.isArray(disorder.red_flags)) {
        const flagHit = disorder.red_flags.some(rf => DifferentialSearchEngine.matchFieldValue(rf, val, isPhrase));
        if (flagHit) {
          score += 25;
          termMatchedInDoc = true;
          matchedFields.add('Emergency Red Flags');
        }
      }

      // Differentials & Mimics match
      if (Array.isArray(disorder.differentials)) {
        disorder.differentials.forEach(diff => {
          if (DifferentialSearchEngine.matchFieldValue(diff.mimic, val, isPhrase)) {
            score += 25;
            termMatchedInDoc = true;
            matchedFields.add(`Mimic: ${diff.mimic}`);
          }
          if (DifferentialSearchEngine.matchFieldValue(diff.overlap, val, isPhrase)) {
            score += 20;
            termMatchedInDoc = true;
            matchedFields.add('Symptom Overlap');
          }
          if (DifferentialSearchEngine.matchFieldValue(diff.physical_signs, val, isPhrase)) {
            score += 18;
            termMatchedInDoc = true;
            matchedFields.add('Physical Signs');
          }
          if (DifferentialSearchEngine.matchFieldValue(diff.workup, val, isPhrase)) {
            score += 15;
            termMatchedInDoc = true;
            matchedFields.add('Diagnostic Workup');
          }
        });
      }

      if (termMatchedInDoc) hitCount++;
    });

    return {
      score,
      termHitCount: hitCount,
      matchedFields: Array.from(matchedFields)
    };
  }

  /**
   * Determine graduated fit rating tier
   */
  static getTier(score, hitCount, totalPositiveTerms, isStrictBooleanMatch) {
    if (totalPositiveTerms === 0) {
      return {
        level: 'neutral',
        label: 'Reference Entry',
        badgeClass: 'badge-neutral',
        description: 'Complete diagnostic monograph'
      };
    }

    const hitRatio = hitCount / totalPositiveTerms;

    // Best Fit: Strict Boolean match with high score OR all search terms matched
    if ((isStrictBooleanMatch && hitRatio >= 0.8 && score >= 50) || (hitRatio === 1.0 && score >= 60)) {
      return {
        level: 'best',
        label: 'Best Fit',
        badgeClass: 'badge-best-fit',
        icon: '🟢',
        description: 'High symptom and criterion concordance; primary diagnostic match'
      };
    }

    // Moderate Fit: Substantial overlap or partial boolean concordance
    if (hitRatio >= 0.4 || score >= 35) {
      return {
        level: 'moderate',
        label: 'Moderate Fit',
        badgeClass: 'badge-moderate-fit',
        icon: '🟡',
        description: 'Plausible differential diagnosis; significant shared symptom cluster'
      };
    }

    // Loose Association: Secondary screening rule-out or distant organic mimic
    return {
      level: 'loose',
      label: 'Loose Association',
      badgeClass: 'badge-loose-fit',
      icon: '⚪',
      description: 'Secondary rule-out consideration or peripheral mimic overlap'
    };
  }

  /**
   * Execute full search query with Boolean logic, tiered scoring, and facets
   */
  search(queryString, filters = {}) {
    if (!this.isReady) return { results: [], total: 0, queryType: 'uninitialized' };

    const trimmed = (queryString || '').trim();
    const activeCategory = filters.category || 'all';
    const activeDiscipline = filters.discipline || 'all';
    const activeTier = filters.tier || 'all';

    // Base collection filtered by category/discipline if specified
    let pool = this.disorders.filter(d => {
      if (activeCategory !== 'all' && d.category !== activeCategory) return false;
      if (activeDiscipline !== 'all') {
        const hasDisc = d.differentials && d.differentials.some(diff => 
          diff.discipline && diff.discipline.toLowerCase().includes(activeDiscipline.toLowerCase())
        );
        if (!hasDisc) return false;
      }
      return true;
    });

    if (!trimmed) {
      // Empty search: return categorized disorder catalog
      const results = pool.map(d => ({
        disorder: d,
        score: 0,
        tier: DifferentialSearchEngine.getTier(0, 0, 0, false),
        matchedFields: []
      }));
      return {
        results,
        total: results.length,
        queryType: 'catalog',
        fallback: false
      };
    }

    // Parse Boolean AST
    const Parser = (typeof BooleanParser !== 'undefined') ? BooleanParser : require('./parser.js');
    const ast = Parser.parse(trimmed);
    const positiveTerms = ast ? Parser.extractTerms(ast) : [];

    // 1. First attempt: Strict Boolean AST evaluation
    let matches = [];
    pool.forEach(d => {
      const isMatch = this.evaluateNode(ast, d);
      if (isMatch) {
        const { score, termHitCount, matchedFields } = this.computeScore(d, positiveTerms);
        const tier = DifferentialSearchEngine.getTier(score, termHitCount, positiveTerms.length, true);
        matches.push({
          disorder: d,
          score,
          termHitCount,
          tier,
          matchedFields
        });
      }
    });

    let isFallback = false;

    // 2. Fallback: If strict Boolean yielded 0 results, perform soft OR scoring
    if (matches.length === 0 && positiveTerms.length > 0) {
      isFallback = true;
      pool.forEach(d => {
        const { score, termHitCount, matchedFields } = this.computeScore(d, positiveTerms);
        if (termHitCount > 0 || score > 0) {
          const tier = DifferentialSearchEngine.getTier(score, termHitCount, positiveTerms.length, false);
          matches.push({
            disorder: d,
            score,
            termHitCount,
            tier,
            matchedFields
          });
        }
      });
    }

    // Filter by tier if specified
    if (activeTier !== 'all') {
      matches = matches.filter(m => m.tier.level === activeTier);
    }

    // Sort: Best Fit first, then by score descending
    const tierPriority = { best: 3, moderate: 2, loose: 1, neutral: 0 };
    matches.sort((a, b) => {
      const pDiff = (tierPriority[b.tier.level] || 0) - (tierPriority[a.tier.level] || 0);
      if (pDiff !== 0) return pDiff;
      return b.score - a.score;
    });

    return {
      results: matches,
      total: matches.length,
      queryType: isFallback ? 'fallback_or' : 'boolean',
      fallback: isFallback,
      positiveTerms
    };
  }

  /**
   * Search specifically within the Canonical Medical Mimics database
   */
  searchMimics(term) {
    if (!term || !this.mimics.length) return [];
    const t = term.toLowerCase().trim();
    return this.mimics.filter(m => 
      (m.name && m.name.toLowerCase().includes(t)) ||
      (m.discipline && m.discipline.toLowerCase().includes(t)) ||
      (m.systemic_symptoms && m.systemic_symptoms.toLowerCase().includes(t)) ||
      (m.physical_signs && m.physical_signs.toLowerCase().includes(t)) ||
      (m.diagnostic_workup && m.diagnostic_workup.toLowerCase().includes(t))
    );
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DifferentialSearchEngine;
}
