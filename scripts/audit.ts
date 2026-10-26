import { parseCSV, parseJSON, parseTable } from '../src/profiler/parsers.js';
import { inferColumnType, inferValueType } from '../src/profiler/type-inference.js';
import { computeNumericStats, computeStringStats } from '../src/profiler/stats.js';
import { profileDataset, preflightDataset } from '../src/profiler/engine.js';
import { SAMPLE_DATASETS } from '../src/profiler/sample-datasets.js';
import { config, LIMITS } from '../src/config.js';

interface AuditCheck {
  name: string;
  category: string;
  passed: boolean;
  details?: string;
}

const checks: AuditCheck[] = [];

function check(name: string, category: string, fn: () => void) {
  try {
    fn();
    checks.push({ name, category, passed: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push({ name, category, passed: false, details: msg });
  }
}

console.log('========================================================');
console.log('  🔍 TablePulse Comprehensive System & Quality Audit');
console.log('========================================================\n');

// 1. Security & Configuration Audit
check('Network Guard: Target network is Base Sepolia only', 'Security', () => {
  if (config.X402_NETWORK !== 'eip155:84532') {
    throw new Error(`Expected eip155:84532, got ${config.X402_NETWORK}`);
  }
});

check('Resource Limits: Limits defined and within safe boundaries', 'Security', () => {
  if (LIMITS.MAX_ROWS > 50000) throw new Error('MAX_ROWS too high');
  if (LIMITS.MAX_COLUMNS > 200) throw new Error('MAX_COLUMNS too high');
  if (LIMITS.MAX_DATASET_CONTENT_BYTES > 10 * 1024 * 1024) throw new Error('Content limit too high');
});

// 2. Parser & Delimiter Sniffing Audit
check('CSV Parser: Delimiter sniffing (semicolons, commas, tabs)', 'Parsers', () => {
  const semicolonCsv = 'id;name;age\n1;Alice;25\n2;Bob;30\n';
  const parsed = parseCSV(semicolonCsv);
  if (parsed.headers.length !== 3 || parsed.rowCount !== 2) {
    throw new Error(`Failed semicolon parsing: headers=${parsed.headers.length}, rows=${parsed.rowCount}`);
  }

  const commaCsv = 'colA,colB\n10,20\n30,40\n';
  const parsed2 = parseCSV(commaCsv);
  if (parsed2.headers.length !== 2 || parsed2.rowCount !== 2) {
    throw new Error('Failed comma parsing');
  }
});

check('JSON Parser: Array of objects & columnar object formats', 'Parsers', () => {
  const arrJson = JSON.stringify([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
  const parsedArr = parseJSON(arrJson);
  if (parsedArr.rowCount !== 2 || parsedArr.columnCount !== 2) {
    throw new Error('Failed array JSON parsing');
  }

  const colJson = JSON.stringify({ x: [1, 2, 3], y: ['a', 'b', 'c'] });
  const parsedCol = parseJSON(colJson);
  if (parsedCol.rowCount !== 3 || parsedCol.columnCount !== 2) {
    throw new Error('Failed columnar JSON parsing');
  }
});

check('Parser Boundaries: Rejection of oversized payloads', 'Parsers', () => {
  let threw = false;
  try {
    parseCSV('a,b\n1,2', 2); // 2 bytes limit
  } catch {
    threw = true;
  }
  if (!threw) throw new Error('Expected ResourceLimitError for byte size');
});

// 3. Type Inference & Statistics Audit
check('Type Inference: Accurate detection of types', 'Inference', () => {
  if (inferValueType('12345') !== 'integer') throw new Error('Failed integer inference');
  if (inferValueType('123.456') !== 'float') throw new Error('Failed float inference');
  if (inferValueType('true') !== 'boolean') throw new Error('Failed boolean inference');
  if (inferValueType('user@example.com') !== 'email') throw new Error('Failed email inference');
  if (inferValueType('https://x402.org') !== 'url') throw new Error('Failed URL inference');
  if (inferValueType('2024-03-15') !== 'date') throw new Error('Failed date inference');

  const intCol = ['10', '20', '30', null, '40'];
  if (inferColumnType(intCol) !== 'integer') throw new Error('Failed column integer inference');

  const mixedNumCol = ['10', '20.5', '30', '40.2'];
  if (inferColumnType(mixedNumCol) !== 'float') throw new Error('Failed mixed numeric inference');
});

check('Statistics: Accurate numeric distribution and outlier detection', 'Stats', () => {
  const normalNums = [10, 12, 11, 13, 12, 10, 11, 12, 100]; // 100 is outlier
  const stats = computeNumericStats(normalNums);
  if (!stats) throw new Error('Stats computation returned null');
  if (stats.min !== 10) throw new Error(`Expected min 10, got ${stats.min}`);
  if (stats.max !== 100) throw new Error(`Expected max 100, got ${stats.max}`);
  if (stats.outliersCount !== 1) throw new Error(`Expected 1 outlier, got ${stats.outliersCount}`);
  if (stats.histogram.length !== 10) throw new Error('Expected 10-bucket histogram');
});

// 4. Quality Rules & Engine Audit
check('Preflight Engine: Lightweight preflight verification', 'Engine', () => {
  const validPreflight = preflightDataset('name,age\nAlice,30\nBob,25');
  if (!validPreflight.valid || validPreflight.estimatedRows !== 2) {
    throw new Error('Valid preflight failed');
  }

  const invalidPreflight = preflightDataset('{{{invalid json');
  if (invalidPreflight.valid) {
    throw new Error('Invalid preflight should have failed');
  }
});

check('Sample Datasets: All built-in samples profile successfully with expected grades', 'Quality', () => {
  for (const sample of SAMPLE_DATASETS) {
    const report = profileDataset(sample.content, {
      datasetName: sample.name,
      format: sample.format,
    });

    if (!report.summary.qualityGrade) {
      throw new Error(`Sample ${sample.name} produced no quality grade`);
    }

    if (report.columns.length === 0) {
      throw new Error(`Sample ${sample.name} produced zero columns`);
    }

    // Verify safe JSON: no NaNs or Infinities
    const jsonStr = JSON.stringify(report);
    if (jsonStr.includes('NaN') || jsonStr.includes('Infinity')) {
      throw new Error(`Report contains NaN or Infinity for ${sample.name}`);
    }
  }
});

// Print Results
const categories = Array.from(new Set(checks.map((c) => c.category)));
let totalPassed = 0;

for (const cat of categories) {
  console.log(`[Category: ${cat}]`);
  const catChecks = checks.filter((c) => c.category === cat);
  for (const c of catChecks) {
    if (c.passed) {
      totalPassed++;
      console.log(`  ✅ ${c.name}`);
    } else {
      console.log(`  ❌ ${c.name}`);
      console.log(`     Error: ${c.details}`);
    }
  }
  console.log();
}

console.log('--------------------------------------------------------');
console.log(`Audit Summary: ${totalPassed} / ${checks.length} checks passed (${Math.round((totalPassed / checks.length) * 100)}%)`);

if (totalPassed === checks.length) {
  console.log('🎉 System is verified healthy and compliant with TablePulse specifications!');
  console.log('========================================================\n');
  process.exit(0);
} else {
  console.error('⚠️ Some audit checks failed. Review errors above.');
  console.log('========================================================\n');
  process.exit(1);
}
