import { createApp } from './app.js';
import { config, PRODUCT_NAME, PRODUCT_VERSION } from './config.js';

const app = createApp();

const server = app.listen(config.PORT, () => {
  console.log(`====================================================`);
  console.log(`  🚀 ${PRODUCT_NAME} v${PRODUCT_VERSION} ready`);
  console.log(`  📡 Server listening on http://localhost:${config.PORT}`);
  console.log(`  💰 x402 Payments: ${config.PAYMENTS_ENABLED ? 'ENABLED (Base Sepolia)' : 'DISABLED (Free / Dev Mode)'}`);
  if (config.PAYMENTS_ENABLED) {
    console.log(`  🎯 Receiving Address: ${config.X402_PAY_TO}`);
    console.log(`  🏷️  Profile Price: $${config.X402_PROFILE_PRICE} USD`);
    console.log(`  📦 Batch Price:   $${config.X402_BATCH_PRICE} USD`);
  }
  console.log(`  🖥️  Developer Console: http://localhost:${config.PORT}`);
  console.log(`  🩺 Health Endpoint:  http://localhost:${config.PORT}/health`);
  console.log(`====================================================`);
});

// Graceful shutdown handling
function handleShutdown(signal: string) {
  console.log(`\n[TablePulse] Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('[TablePulse] HTTP server closed. Exiting process.');
    process.exit(0);
  });

  // Force close after 5 seconds if open connections hang
  setTimeout(() => {
    console.error('[TablePulse] Forcefully terminating after timeout.');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
