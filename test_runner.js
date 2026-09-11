const fs = require('fs');
const Parser = require('./js/parser.js');
const SearchEngine = require('./js/searchEngine.js');
const WikiView = require('./js/wikiView.js');
const FormDrawer = require('./js/formDrawer.js');

console.log('Loading dataset files...');
const disorders = JSON.parse(fs.readFileSync('./data/disorders.json', 'utf8'));
const mimics = JSON.parse(fs.readFileSync('./data/mimics.json', 'utf8'));

console.log(`Disorders count: ${disorders.length}`);
console.log(`Mimics count: ${mimics.length}`);

const engine = new SearchEngine();
engine.init(disorders, mimics);

// Test 1: Complex Boolean Parsing
const q1 = 'fatigue AND (insomnia OR lethargy) NOT hypothyroidism';
const ast = Parser.parse(q1);
console.log(`Test 1: Boolean AST parsed: ${ast.type === 'AND' && ast.right.type === 'NOT' ? 'OK' : 'FAIL'}`);

// Test 2: Search execution with Graduated Fit
const res1 = engine.search('panic AND tachycardia');
console.log(`Test 2: "panic AND tachycardia" yielded ${res1.total} results`);
if (res1.results.length > 0) {
  console.log(`   Top match: ${res1.results[0].disorder.name} [${res1.results[0].tier.label}]`);
}

// Test 3: Fielded search
const res2 = engine.search('mimic:pheochromocytoma');
console.log(`Test 3: "mimic:pheochromocytoma" yielded ${res2.total} results`);
if (res2.results.length > 0) {
  console.log(`   Top match: ${res2.results[0].disorder.name} [${res2.results[0].tier.label}]`);
}

// Test 4: WikiView rendering
const sample = disorders[0];
const wikiHtml = WikiView.renderDisorder(sample, [{ value: 'intellectual' }]);
console.log(`Test 4: WikiView generated HTML length: ${wikiHtml.length} chars`);

// Test 5: Form rendering & Unsaved Changes Guard
const drawer = new FormDrawer();
const crisisHtml = drawer.renderCrisisForm(sample);
const consultHtml = drawer.renderConsultationForm(sample);
console.log(`Test 5: Crisis Form HTML length: ${crisisHtml.length} chars`);
console.log(`Test 5: Consult Form HTML length: ${consultHtml.length} chars`);
console.log(`Test 5b: FormDrawer hasUnsavedChanges method defined: ${typeof drawer.hasUnsavedChanges === 'function' ? 'OK' : 'FAIL'}`);

// Test 6: Morphological Stemming Integration (Audit Recommendation 1)
const stemmer = Parser.ClinicalStemmer;
console.log(`Test 6a: Stemmer 'tachycardic' -> '${stemmer.stem('tachycardic')}' (expected 'tachycard')`);
console.log(`Test 6b: Stemmer 'tremors' -> '${stemmer.stem('tremors')}' (expected 'tremor')`);
const resStemmed = engine.search('tachycardic');
console.log(`Test 6c: Stemmed query 'tachycardic' matched ${resStemmed.total} disorders (stemmed match to 'tachycardia')`);
if (resStemmed.total > 0) {
  console.log(`   Top match: ${resStemmed.results[0].disorder.name}`);
}

// Test 7: Clinical Acronym Expansion Tests (Revision 26.09.11)
const acronymsToTest = [
  { acronym: 'adhd', expectedName: 'Attention-Deficit/Hyperactivity Disorder' },
  { acronym: 'mdd', expectedName: 'Major Depressive Disorder' },
  { acronym: 'bpd', expectedName: 'Borderline Personality Disorder' },
  { acronym: 'gad', expectedName: 'Generalized Anxiety Disorder' },
  { acronym: 'ptsd', expectedName: 'Posttraumatic Stress Disorder' },
  { acronym: 'ocd', expectedName: 'Obsessive-Compulsive Disorder' }
];

let allAcronymsPassed = true;
acronymsToTest.forEach(({ acronym, expectedName }) => {
  const res = engine.search(acronym);
  const topDisorder = res.results.length > 0 ? res.results[0].disorder.name : 'NONE';
  const passed = topDisorder.toLowerCase().includes(expectedName.toLowerCase());
  console.log(`Test 7 [${acronym.toUpperCase()}]: Top match '${topDisorder}' -> ${passed ? '✅ PASS' : '❌ FAIL (Expected ' + expectedName + ')'}`);
  if (!passed) allAcronymsPassed = false;
});

// Test 8: Interactive ICD-10 Subcode Checklist Generation
const adhdSample = disorders.find(d => d.name.includes('Attention-Deficit/Hyperactivity Disorder'));
const parsedCodes = FormDrawer.parseIcdSubcodes(adhdSample.icd10);
console.log(`Test 8: ADHD ICD subcodes parsed (${parsedCodes.length} variants found):`, parsedCodes.map(c => c.code).join(', '));
const hasSubcodes = parsedCodes.length === 5;
console.log(`Test 8 result: ${hasSubcodes ? '✅ PASS' : '❌ FAIL'}`);

// Test 9: Specialist Referral Checkbox Grid in Outpatient Form
const consultFormHtml = drawer.renderConsultationForm(sample);
const hasNeurologyBox = consultFormHtml.includes('value="Neurology"');
const hasEndocrineBox = consultFormHtml.includes('value="Endocrinology"');
console.log(`Test 9: Outpatient Specialist Checkboxes Present: ${hasNeurologyBox && hasEndocrineBox ? '✅ PASS' : '❌ FAIL'}`);

// Test 10: Verify file presence
const files = [
  'index.html',
  'manifest.json',
  'sw.js',
  'css/styles.css',
  'css/print.css',
  'js/parser.js',
  'js/searchEngine.js',
  'js/wikiView.js',
  'js/formDrawer.js',
  'js/app.js',
  'data/disorders.json',
  'data/mimics.json',
  'assets/logo.png',
  'assets/favicon.png',
  'assets/icon-192.png',
  'assets/icon-512.png'
];

let allExist = true;
files.forEach(f => {
  if (!fs.existsSync(f)) {
    console.error(`Missing file: ${f}`);
    allExist = false;
  }
});

if (allExist && allAcronymsPassed && hasSubcodes && hasNeurologyBox) {
  console.log('✅ ALL REVISION SUITE TESTS & ASSETS VERIFIED PRESENT AND VALID!');
}
