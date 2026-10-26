import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { LIMITS, ENGINE_VERSION, PRODUCT_NAME, PRODUCT_VERSION } from '../config.js';
import { AppError, InvalidRequestError, ResourceLimitError, ValidationError } from '../errors.js';
import { preflightDataset, profileDataset } from '../profiler/engine.js';
import { SAMPLE_DATASETS } from '../profiler/sample-datasets.js';
import { BatchProfileResult, ProfileReport } from '../profiler/types.js';
import { getPricingInfo } from '../payments/server.js';
import { elapsedMs, utcNow, utf8ByteLength } from '../utils/helpers.js';

export const apiRouter = Router();

// Zod schemas for request validation
const singleProfileSchema = z.object({
  datasetName: z.string().max(LIMITS.MAX_DATASET_NAME_LENGTH).optional().default('dataset'),
  format: z.enum(['csv', 'json']).optional(),
  content: z.string().min(1, 'Dataset content cannot be empty'),
  topNValues: z.coerce.number().int().min(1).max(50).optional().default(10),
});

const batchProfileSchema = z.object({
  datasets: z
    .array(
      z.object({
        datasetName: z.string().max(LIMITS.MAX_DATASET_NAME_LENGTH).default('dataset'),
        format: z.enum(['csv', 'json']).optional(),
        content: z.string().min(1, 'Dataset content cannot be empty'),
      }),
    )
    .min(1, 'Batch must contain at least one dataset')
    .max(LIMITS.MAX_BATCH_SIZE, `Batch cannot exceed ${LIMITS.MAX_BATCH_SIZE} datasets`),
  topNValues: z.coerce.number().int().min(1).max(50).optional().default(10),
});

/**
 * GET /health
 * Service health, version, system metrics, and payment configuration.
 */
apiRouter.get('/health', (req: Request, res: Response) => {
  const pricing = getPricingInfo();
  res.json({
    status: 'healthy',
    service: PRODUCT_NAME,
    version: PRODUCT_VERSION,
    engineVersion: ENGINE_VERSION,
    timestamp: utcNow(),
    uptimeSeconds: Math.round(process.uptime()),
    limits: LIMITS,
    payments: {
      enabled: pricing.paymentsEnabled,
      network: pricing.network,
      profilePriceUsd: pricing.profilePriceUsd,
      batchPriceUsd: pricing.batchPriceUsd,
    },
  });
});

/**
 * GET /api/v1/pricing
 * Current x402 micropayment pricing and recipient address.
 */
apiRouter.get('/api/v1/pricing', (req: Request, res: Response) => {
  res.json(getPricingInfo());
});

/**
 * GET /api/v1/sample-datasets
 * Built-in sample datasets for instant demonstration and testing.
 */
apiRouter.get('/api/v1/sample-datasets', (req: Request, res: Response) => {
  res.json({
    count: SAMPLE_DATASETS.length,
    datasets: SAMPLE_DATASETS,
  });
});

/**
 * POST /api/v1/preflight
 * Zero-cost validation check to verify data format and limits before payment.
 */
apiRouter.post('/api/v1/preflight', (req: Request, res: Response, next: NextFunction) => {
  try {
    let content: string;
    let format: 'csv' | 'json' | undefined;

    if (typeof req.body === 'string') {
      content = req.body;
    } else if (req.body && typeof req.body === 'object') {
      if ('content' in req.body) {
        content = String(req.body.content);
        format = req.body.format;
      } else {
        content = JSON.stringify(req.body);
        format = 'json';
      }
    } else {
      throw new InvalidRequestError('Request body must provide dataset content');
    }

    const preflight = preflightDataset(content, format);
    const statusCode = preflight.valid ? 200 : 422;
    res.status(statusCode).json(preflight);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/profile
 * Profile a single tabular dataset (CSV or JSON).
 * Protected by x402 payment requirements when PAYMENTS_ENABLED=true.
 */
apiRouter.post('/api/v1/profile', (req: Request, res: Response, next: NextFunction) => {
  try {
    let datasetName = 'dataset';
    let format: 'csv' | 'json' | undefined;
    let content: string;
    let topNValues = 10;

    if (typeof req.body === 'string') {
      content = req.body;
      const isJson = req.headers['content-type']?.includes('json');
      format = isJson ? 'json' : 'csv';
      if (req.query.name) datasetName = String(req.query.name);
    } else if (req.body && typeof req.body === 'object') {
      if ('content' in req.body) {
        const parsed = singleProfileSchema.parse(req.body);
        datasetName = parsed.datasetName;
        format = parsed.format;
        content = parsed.content;
        topNValues = parsed.topNValues;
      } else {
        content = JSON.stringify(req.body);
        format = 'json';
        if (req.query.name) datasetName = String(req.query.name);
      }
    } else {
      throw new InvalidRequestError('Request body must contain valid dataset content');
    }

    const report = profileDataset(content, {
      datasetName,
      format,
      topNValues,
    });

    res.json(report);
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new ValidationError('Invalid request payload', err.flatten()));
    } else {
      next(err);
    }
  }
});

/**
 * POST /api/v1/profile/batch
 * Profile multiple tabular datasets in a single transaction.
 * Protected by x402 payment requirements when PAYMENTS_ENABLED=true.
 */
apiRouter.post('/api/v1/profile/batch', (req: Request, res: Response, next: NextFunction) => {
  const startTime = process.hrtime();
  try {
    const parsed = batchProfileSchema.parse(req.body);
    const batchId = `batch_${uuidv4().slice(0, 8)}`;

    // Verify total batch payload size
    let totalBytes = 0;
    for (const ds of parsed.datasets) {
      totalBytes += utf8ByteLength(ds.content);
    }

    if (totalBytes > LIMITS.MAX_BATCH_CONTENT_BYTES) {
      throw new ResourceLimitError(
        `Total batch content size (${(totalBytes / (1024 * 1024)).toFixed(2)} MB) exceeds limit of ${LIMITS.MAX_BATCH_CONTENT_BYTES / (1024 * 1024)} MB`,
      );
    }

    const reports: BatchProfileResult['reports'] = [];
    let successfulCount = 0;
    let failedCount = 0;

    for (const item of parsed.datasets) {
      try {
        const report = profileDataset(item.content, {
          datasetName: item.datasetName,
          format: item.format,
          topNValues: parsed.topNValues,
        });
        reports.push({
          datasetName: item.datasetName,
          success: true,
          report,
        });
        successfulCount++;
      } catch (itemErr: unknown) {
        const errMsg = itemErr instanceof Error ? itemErr.message : String(itemErr);
        reports.push({
          datasetName: item.datasetName,
          success: false,
          error: errMsg,
        });
        failedCount++;
      }
    }

    const result: BatchProfileResult = {
      batchId,
      timestamp: utcNow(),
      totalDatasets: parsed.datasets.length,
      successfulCount,
      failedCount,
      durationMs: elapsedMs(startTime),
      reports,
    };

    res.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(new ValidationError('Invalid batch request payload', err.flatten()));
    } else {
      next(err);
    }
  }
});
