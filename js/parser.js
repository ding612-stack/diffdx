/**
 * Boolean Query Parser and AST Evaluator for Clinical Differential Engine
 * Supports: AND, OR, NOT, parentheses (), quoted phrases "", and field prefixes (sym:, mimic:, lab:, icd:, etc.)
 */

class BooleanParser {
  /**
   * Tokenize input string into an array of token objects
   * @param {string} queryString 
   * @returns {Array<{type: string, value: string, field?: string}>}
   */
  static tokenize(queryString) {
    if (!queryString || typeof queryString !== 'string') return [];
    
    const tokens = [];
    // Regex matches:
    // 1. Parentheses: ( or )
    // 2. Fielded quoted phrases: (field):"phrase with spaces"
    // 3. Fielded terms: (field):word
    // 4. Standalone quoted phrases: "phrase with spaces"
    // 5. Standalone words / operators
    const regex = /(\()|(\))|(?:(\b(?:sym|symptom|mimic|lab|workup|sign|icd|cat|category|redflag|flag)\b):(?:"([^"]+)"|(\S+)))|(?:"([^"]+)")|([^\s()]+)/gi;
    
    let match;
    while ((match = regex.exec(queryString)) !== null) {
      if (match[1]) {
        tokens.push({ type: 'LPAREN', value: '(' });
      } else if (match[2]) {
        tokens.push({ type: 'RPAREN', value: ')' });
      } else if (match[3]) {
        // Field prefix detected
        const rawField = match[3].toLowerCase();
        const field = BooleanParser.normalizeField(rawField);
        const value = match[4] !== undefined ? match[4] : match[5];
        tokens.push({
          type: 'TERM',
          field: field,
          value: value.toLowerCase().trim(),
          isPhrase: match[4] !== undefined
        });
      } else if (match[6]) {
        // Quoted phrase without field prefix
        tokens.push({
          type: 'TERM',
          field: 'all',
          value: match[6].toLowerCase().trim(),
          isPhrase: true
        });
      } else if (match[7]) {
        const rawWord = match[7];
        const upper = rawWord.toUpperCase();
        if (upper === 'AND') {
          tokens.push({ type: 'AND', value: 'AND' });
        } else if (upper === 'OR') {
          tokens.push({ type: 'OR', value: 'OR' });
        } else if (upper === 'NOT') {
          tokens.push({ type: 'NOT', value: 'NOT' });
        } else {
          tokens.push({
            type: 'TERM',
            field: 'all',
            value: rawWord.toLowerCase().trim(),
            isPhrase: false
          });
        }
      }
    }

    // Insert implicit ANDs between adjacent terms/parentheses where no operator exists:
    // e.g., "fatigue tremor" -> "fatigue AND tremor"
    // "fatigue (insomnia OR lethargy)" -> "fatigue AND (insomnia OR lethargy)"
    const tokensWithImplicitAnd = [];
    for (let i = 0; i < tokens.length; i++) {
      const current = tokens[i];
      tokensWithImplicitAnd.push(current);
      if (i < tokens.length - 1) {
        const next = tokens[i + 1];
        const isCurrentOperand = (current.type === 'TERM' || current.type === 'RPAREN');
        const isNextOperand = (next.type === 'TERM' || next.type === 'LPAREN' || next.type === 'NOT');
        if (isCurrentOperand && isNextOperand) {
          tokensWithImplicitAnd.push({ type: 'AND', value: 'AND' });
        }
      }
    }

    return tokensWithImplicitAnd;
  }

  static normalizeField(rawField) {
    switch (rawField) {
      case 'sym':
      case 'symptom':
        return 'symptoms';
      case 'mimic':
        return 'mimic';
      case 'lab':
      case 'workup':
        return 'workup';
      case 'sign':
        return 'physical_signs';
      case 'icd':
        return 'icd';
      case 'cat':
      case 'category':
        return 'category';
      case 'redflag':
      case 'flag':
        return 'red_flags';
      default:
        return 'all';
    }
  }

  /**
   * Parse token stream into an Abstract Syntax Tree (AST) using recursive descent
   * Operator Precedence:
   * 1. NOT (highest unary)
   * 2. AND
   * 3. OR (lowest binary)
   */
  static parse(queryString) {
    const tokens = BooleanParser.tokenize(queryString);
    if (!tokens.length) return null;

    let index = 0;
    function peek() {
      return tokens[index] || null;
    }
    function consume(expectedType) {
      const tok = tokens[index];
      if (!tok || (expectedType && tok.type !== expectedType)) {
        return null;
      }
      index++;
      return tok;
    }

    // Expr -> OrExpr
    function parseExpression() {
      return parseOr();
    }

    // OrExpr -> AndExpr ( 'OR' AndExpr )*
    function parseOr() {
      let left = parseAnd();
      if (!left) return null;

      while (peek() && peek().type === 'OR') {
        consume('OR');
        const right = parseAnd();
        if (!right) return left;
        left = { type: 'OR', left, right };
      }
      return left;
    }

    // AndExpr -> NotExpr ( 'AND' NotExpr )*
    function parseAnd() {
      let left = parseNot();
      if (!left) return null;

      while (peek() && peek().type === 'AND') {
        consume('AND');
        const right = parseNot();
        if (!right) return left;
        left = { type: 'AND', left, right };
      }
      return left;
    }

    // NotExpr -> 'NOT' NotExpr | Primary
    function parseNot() {
      if (peek() && peek().type === 'NOT') {
        consume('NOT');
        const operand = parseNot();
        if (!operand) return null;
        return { type: 'NOT', operand };
      }
      return parsePrimary();
    }

    // Primary -> '(' Expr ')' | TERM
    function parsePrimary() {
      const tok = peek();
      if (!tok) return null;

      if (tok.type === 'LPAREN') {
        consume('LPAREN');
        const expr = parseExpression();
        consume('RPAREN'); // consume closing paren if present
        return expr;
      }

      if (tok.type === 'TERM') {
        consume('TERM');
        return {
          type: 'TERM',
          field: tok.field || 'all',
          value: tok.value,
          isPhrase: tok.isPhrase
        };
      }

      // Skip unexpected tokens gracefully
      consume();
      return null;
    }

    return parseExpression();
  }

  /**
   * Recursively collect all positive search terms from the AST for highlighting & score weighting
   */
  static extractTerms(ast) {
    const terms = [];
    function traverse(node) {
      if (!node) return;
      if (node.type === 'TERM') {
        terms.push({ field: node.field, value: node.value, isPhrase: node.isPhrase });
      } else if (node.type === 'AND' || node.type === 'OR') {
        traverse(node.left);
        traverse(node.right);
      }
      // Note: We don't extract positive terms from under a NOT node for positive scoring!
    }
    traverse(ast);
    return terms;
  }
}

/**
 * Lightweight Clinical and English Morphological Stemmer
 * Normalizes plurals, verb conjugations, and clinical Greek/Latin suffixes
 */
class ClinicalStemmer {
  static stem(word) {
    if (!word || typeof word !== 'string' || word.length <= 3) return word ? word.toLowerCase() : '';
    let w = word.toLowerCase().trim();

    // Specific clinical suffix pairs:
    // -cardic / -cardia -> card
    if (w.endsWith('cardic') || w.endsWith('cardia')) {
      return w.replace(/(cardic|cardia)$/, 'card');
    }
    // -atonic / -atonia -> aton
    if (w.endsWith('atonic') || w.endsWith('atonia')) {
      return w.replace(/(atonic|atonia)$/, 'aton');
    }
    // -phoria / -phoric -> phor
    if (w.endsWith('phoria') || w.endsWith('phoric')) {
      return w.replace(/(phoria|phoric)$/, 'phor');
    }
    // -somnic / -somnia -> somn
    if (w.endsWith('somnic') || w.endsWith('somnia')) {
      return w.replace(/(somnic|somnia)$/, 'somn');
    }
    // -thyroidic / -thyroidal / -thyroidism -> thyroid
    if (w.endsWith('thyroidic') || w.endsWith('thyroidal') || w.endsWith('thyroidism')) {
      return w.replace(/(thyroidic|thyroidal|thyroidism)$/, 'thyroid');
    }
    // -itis / -itic (inflammation)
    if (w.endsWith('itic') || w.endsWith('itis')) {
      return w.replace(/(itic|itis)$/, 'it');
    }
    // -adverb / adjectival derivations
    if (w.endsWith('ically')) w = w.slice(0, -6);
    else if (w.endsWith('ical')) w = w.slice(0, -4);

    // Standard inflection reductions:
    // -ies -> y (anxieties -> anxiety)
    if (w.endsWith('ies') && w.length > 4) {
      return w.slice(0, -3) + 'y';
    }
    // -es / -s
    if (w.endsWith('sses')) {
      w = w.slice(0, -2);
    } else if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('is') && !w.endsWith('us') && w.length > 3) {
      w = w.slice(0, -1);
    }

    // -ing
    if (w.endsWith('ing') && w.length > 5) {
      w = w.slice(0, -3);
    }
    // -ed
    else if (w.endsWith('ed') && w.length > 4) {
      w = w.slice(0, -2);
    }
    // -tion / -sion
    else if ((w.endsWith('tion') || w.endsWith('sion')) && w.length > 5) {
      w = w.slice(0, -4);
    }
    // -ment
    else if (w.endsWith('ment') && w.length > 6) {
      w = w.slice(0, -4);
    }

    return w;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = BooleanParser;
  module.exports.BooleanParser = BooleanParser;
  module.exports.ClinicalStemmer = ClinicalStemmer;
}
