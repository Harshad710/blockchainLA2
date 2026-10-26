import dotenv from 'dotenv';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { x402Client } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { wrapFetchWithPayment } from '@x402/fetch';
import { SAMPLE_DATASETS } from '../src/profiler/sample-datasets.js';
import { ProfileReport } from '../src/profiler/types.js';

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const rawPrivateKey = process.env.BUYER_PRIVATE_KEY;

async function runBuyer() {
  console.log('========================================================');
  console.log('  💼 TablePulse x402 Programmatic Buyer (Single Profile)');
  console.log('========================================================');
  console.log(`Target URL: ${API_BASE_URL}`);

  // 1. Establish Wallet Signer
  let account;
  if (rawPrivateKey && rawPrivateKey.startsWith('0x') && rawPrivateKey.length === 66) {
    account = privateKeyToAccount(rawPrivateKey as `0x${string}`);
    console.log(`Using configured buyer wallet: ${account.address}`);
  } else {
    const randomPk = generatePrivateKey();
    account = privateKeyToAccount(randomPk);
    console.log(`Using ephemeral session wallet: ${account.address} (Demo mode)`);
  }

  // 2. Setup x402 Client with EVM Exact Scheme
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  const paidFetch = wrapFetchWithPayment(globalThis.fetch, client);

  // 3. Preflight Health & Pricing Check
  try {
    const healthRes = await fetch(`${API_BASE_URL}/health`);
    if (!healthRes.ok) {
      console.error(`Target server health check failed (${healthRes.status}). Is TablePulse running?`);
      process.exit(1);
    }
    const health = (await healthRes.json()) as {
      status: string;
      service: string;
      version: string;
      payments: {
        enabled: boolean;
        profilePriceUsd: number;
        network: string;
      };
    };
    console.log(`Server Status: ${health.status} (${health.service} v${health.version})`);
    console.log(`Payments Enabled: ${health.payments.enabled ? 'YES (x402 paywall active)' : 'NO (Free/Dev mode)'}`);
    if (health.payments.enabled) {
      console.log(`Single Profile Price: $${health.payments.profilePriceUsd} USD`);
      console.log(`Target Network: ${health.payments.network}`);
    }
  } catch (err) {
    console.error(`Cannot connect to server at ${API_BASE_URL}. Start it with 'npm run dev'.`);
    process.exit(1);
  }

  // 4. Select Sample Dataset to Profile
  const sample = SAMPLE_DATASETS[0]; // ecommerce orders
  console.log(`\nSubmitting dataset "${sample.name}" for profiling...`);
  console.log(`Description: ${sample.description}`);

  // 5. Send Profiling Request through x402 Paid Fetch
  const startTime = Date.now();
  try {
    const response = await paidFetch(`${API_BASE_URL}/api/v1/profile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        datasetName: sample.name,
        format: sample.format,
        content: sample.content,
        topNValues: 5,
      }),
    });

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`Request failed with status ${response.status}:`, errBody);
      return;
    }

    const report = (await response.json()) as ProfileReport;

    console.log(`\n✅ Profiling Report Received in ${elapsed}ms:`);
    console.log('--------------------------------------------------------');
    console.log(`Dataset:        ${report.summary.name} (${report.summary.format.toUpperCase()})`);
    console.log(`Quality Grade:  [Grade ${report.summary.qualityGrade}] (Score: ${report.summary.qualityScore}/100)`);
    console.log(`Dimensions:     ${report.summary.rowCount} rows × ${report.summary.columnCount} columns`);
    console.log(`Duplicate Rows: ${report.summary.duplicateRowCount} (${report.summary.duplicateRowPercentage}%)`);
    console.log(`Memory Footprint: ${(report.summary.memoryBytes / 1024).toFixed(2)} KB`);
    console.log(`Active Alerts:  ${report.alerts.length} total (Critical: ${report.summary.totalAlerts.critical}, Warnings: ${report.summary.totalAlerts.warning})`);

    console.log('\nColumn Breakdown:');
    for (const col of report.columns) {
      const nullInfo = col.nullCount > 0 ? `[${col.nullCount} nulls (${col.nullPercentage}%)]` : '[no nulls]';
      const typeInfo = col.inferredType.padEnd(8);
      console.log(`  - ${col.name.padEnd(20)} ${typeInfo} ${nullInfo} Score: ${col.qualityScore}/100`);
    }

    if (report.remediations.length > 0) {
      console.log('\nTop Recommended Remediation:');
      const rec = report.remediations[0];
      console.log(`  💡 ${rec.title}`);
      console.log(`     Action: ${rec.suggestedAction}`);
      if (rec.pythonSnippet) console.log(`     Python: ${rec.pythonSnippet}`);
      if (rec.sqlSnippet) console.log(`     SQL:    ${rec.sqlSnippet}`);
    }

    console.log('\nPayment Metadata:');
    const paymentStatus = response.headers.get('x-payment-status') || 'standard';
    const paymentNetwork = response.headers.get('x-payment-network') || 'N/A';
    console.log(`  Status:  ${paymentStatus}`);
    console.log(`  Network: ${paymentNetwork}`);
    console.log('========================================================\n');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error executing x402 payment and profiling:', msg);
  }
}

runBuyer().catch(console.error);
