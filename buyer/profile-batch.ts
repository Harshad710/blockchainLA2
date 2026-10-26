import dotenv from 'dotenv';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { x402Client } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { wrapFetchWithPayment } from '@x402/fetch';
import { SAMPLE_DATASETS } from '../src/profiler/sample-datasets.js';
import { BatchProfileResult } from '../src/profiler/types.js';

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const rawPrivateKey = process.env.BUYER_PRIVATE_KEY;

async function runBatchBuyer() {
  console.log('========================================================');
  console.log('  📦 TablePulse x402 Programmatic Buyer (Batch Profile)');
  console.log('========================================================');
  console.log(`Target URL: ${API_BASE_URL}`);

  let account;
  if (rawPrivateKey && rawPrivateKey.startsWith('0x') && rawPrivateKey.length === 66) {
    account = privateKeyToAccount(rawPrivateKey as `0x${string}`);
    console.log(`Using configured buyer wallet: ${account.address}`);
  } else {
    const randomPk = generatePrivateKey();
    account = privateKeyToAccount(randomPk);
    console.log(`Using ephemeral session wallet: ${account.address} (Demo mode)`);
  }

  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  const paidFetch = wrapFetchWithPayment(globalThis.fetch, client);

  // Prepare batch of 3 datasets
  const batchDatasets = SAMPLE_DATASETS.slice(0, 3).map((s) => ({
    datasetName: s.name,
    format: s.format,
    content: s.content,
  }));

  console.log(`\nSubmitting batch of ${batchDatasets.length} datasets:`);
  batchDatasets.forEach((d, i) => console.log(`  ${i + 1}. ${d.datasetName} (${d.format.toUpperCase()})`));

  const startTime = Date.now();
  try {
    const response = await paidFetch(`${API_BASE_URL}/api/v1/profile/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        datasets: batchDatasets,
        topNValues: 5,
      }),
    });

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`Batch request failed with status ${response.status}:`, errBody);
      return;
    }

    const result = (await response.json()) as BatchProfileResult;

    console.log(`\n✅ Batch Profile Completed in ${elapsed}ms:`);
    console.log('--------------------------------------------------------');
    console.log(`Batch ID:         ${result.batchId}`);
    console.log(`Processed:        ${result.successfulCount} succeeded, ${result.failedCount} failed`);

    console.log('\nIndividual Dataset Results:');
    for (const item of result.reports) {
      if (item.success && item.report) {
        const sum = item.report.summary;
        console.log(`  ✅ ${sum.name.padEnd(26)} Grade: [${sum.qualityGrade}] Score: ${sum.qualityScore}/100 (${sum.rowCount} rows × ${sum.columnCount} cols)`);
      } else {
        console.log(`  ❌ ${item.datasetName.padEnd(26)} Error: ${item.error}`);
      }
    }

    console.log('\n========================================================\n');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error executing x402 batch payment and profiling:', msg);
  }
}

runBatchBuyer().catch(console.error);
