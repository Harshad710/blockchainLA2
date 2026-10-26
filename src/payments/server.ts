import { Request, Response, NextFunction, RequestHandler } from 'express';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import { RoutesConfig } from '@x402/core/server';
import { Network } from '@x402/core/types';
import { config } from '../config.js';

export interface PricingInfo {
  paymentsEnabled: boolean;
  network: string;
  payTo: string;
  profilePriceUsd: number;
  batchPriceUsd: number;
  facilitatorUrl: string;
}

export function getPricingInfo(): PricingInfo {
  return {
    paymentsEnabled: config.PAYMENTS_ENABLED,
    network: config.X402_NETWORK,
    payTo: config.X402_PAY_TO,
    profilePriceUsd: config.X402_PROFILE_PRICE,
    batchPriceUsd: config.X402_BATCH_PRICE,
    facilitatorUrl: config.X402_FACILITATOR_URL,
  };
}

/**
 * Creates the payment middleware for TablePulse.
 * In production/enabled mode, enforces x402 HTTP 402 payment requirements.
 * In development/test mode (PAYMENTS_ENABLED=false), injects simulation headers and passes through.
 */
export function createPaymentMiddleware(): RequestHandler {
  if (!config.PAYMENTS_ENABLED) {
    return (req: Request, res: Response, next: NextFunction) => {
      res.setHeader('X-Payment-Status', 'bypassed-dev-mode');
      res.setHeader('X-Payment-Network', config.X402_NETWORK);
      res.setHeader(
        'X-Payment-Notice',
        'Payments disabled. Request processed under development/demo bypass.',
      );
      next();
    };
  }

  const network = config.X402_NETWORK as Network;
  const server = new x402ResourceServer();
  server.register(network, new ExactEvmScheme());

  const routes: RoutesConfig = {
    'POST /api/v1/profile': {
      accepts: {
        scheme: 'exact',
        price: config.X402_PROFILE_PRICE,
        network,
        payTo: config.X402_PAY_TO,
      },
      description: 'Profile single tabular dataset with TablePulse',
      mimeType: 'application/json',
    },
    'POST /api/v1/profile/batch': {
      accepts: {
        scheme: 'exact',
        price: config.X402_BATCH_PRICE,
        network,
        payTo: config.X402_PAY_TO,
      },
      description: 'Profile batch of tabular datasets with TablePulse',
      mimeType: 'application/json',
    },
  };

  return paymentMiddleware(routes, server, undefined, undefined, false);
}
