import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('API Integration Tests', () => {
  const app = createApp();

  describe('GET /health', () => {
    it('returns healthy status, version, and payment metadata', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(res.body.service).toBe('TablePulse');
      expect(res.body.version).toBe('1.0.0');
      expect(res.body.payments).toBeDefined();
      expect(res.body.limits).toBeDefined();
    });
  });

  describe('GET /api/v1/pricing', () => {
    it('returns current pricing configuration', async () => {
      const res = await request(app).get('/api/v1/pricing');
      expect(res.status).toBe(200);
      expect(res.body.network).toBe('eip155:84532');
      expect(res.body.profilePriceUsd).toBe(0.001);
      expect(res.body.batchPriceUsd).toBe(0.005);
    });
  });

  describe('GET /api/v1/sample-datasets', () => {
    it('returns array of built-in sample datasets with valid structures', async () => {
      const res = await request(app).get('/api/v1/sample-datasets');
      expect(res.status).toBe(200);
      expect(res.body.count).toBeGreaterThanOrEqual(4);
      expect(Array.isArray(res.body.datasets)).toBe(true);

      const first = res.body.datasets[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('content');
    });
  });

  describe('POST /api/v1/preflight', () => {
    it('returns 200 for valid CSV payload', async () => {
      const res = await request(app)
        .post('/api/v1/preflight')
        .send({
          content: 'user_id,email,score\n1,user1@test.com,90\n2,user2@test.com,85',
          format: 'csv',
        });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.readyForProfiling).toBe(true);
      expect(res.body.estimatedRows).toBe(2);
      expect(res.body.columnNames).toEqual(['user_id', 'email', 'score']);
    });

    it('returns 422 for corrupt JSON syntax', async () => {
      const res = await request(app)
        .post('/api/v1/preflight')
        .send({
          content: '{ invalid json structure',
          format: 'json',
        });

      expect(res.status).toBe(422);
      expect(res.body.valid).toBe(false);
      expect(res.body.readyForProfiling).toBe(false);
      expect(res.body.issues.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/profile (single)', () => {
    it('profiles CSV data and returns full ProfileReport', async () => {
      const res = await request(app)
        .post('/api/v1/profile')
        .send({
          datasetName: 'orders.csv',
          content: 'order_id,amount,status\n101,45.50,completed\n102,12.00,pending\n103,99.99,completed',
          topNValues: 5,
        });

      expect(res.status).toBe(200);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.name).toBe('orders.csv');
      expect(res.body.summary.rowCount).toBe(3);
      expect(res.body.summary.columnCount).toBe(3);
      expect(res.body.columns.length).toBe(3);
      expect(res.body.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('profiles JSON array of objects', async () => {
      const res = await request(app)
        .post('/api/v1/profile')
        .send({
          datasetName: 'users.json',
          format: 'json',
          content: JSON.stringify([
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
          ]),
        });

      expect(res.status).toBe(200);
      expect(res.body.summary.format).toBe('json');
      expect(res.body.summary.rowCount).toBe(2);
    });

    it('returns 400 when content is missing', async () => {
      const res = await request(app)
        .post('/api/v1/profile')
        .send({ datasetName: 'empty' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/profile/batch', () => {
    it('profiles multiple datasets in a single batch call', async () => {
      const res = await request(app)
        .post('/api/v1/profile/batch')
        .send({
          datasets: [
            {
              datasetName: 'ds1.csv',
              content: 'a,b\n1,2\n3,4',
            },
            {
              datasetName: 'ds2.json',
              format: 'json',
              content: JSON.stringify([{ x: 10, y: 20 }]),
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.totalDatasets).toBe(2);
      expect(res.body.successfulCount).toBe(2);
      expect(res.body.reports.length).toBe(2);
      expect(res.body.reports[0].report.summary.name).toBe('ds1.csv');
      expect(res.body.reports[1].report.summary.name).toBe('ds2.json');
    });

    it('handles partial failures in batch without crashing whole batch', async () => {
      const res = await request(app)
        .post('/api/v1/profile/batch')
        .send({
          datasets: [
            {
              datasetName: 'valid.csv',
              content: 'col1,col2\n1,2',
            },
            {
              datasetName: 'corrupt.json',
              format: 'json',
              content: '{ invalid',
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.successfulCount).toBe(1);
      expect(res.body.failedCount).toBe(1);
      expect(res.body.reports[1].success).toBe(false);
      expect(res.body.reports[1].error).toBeDefined();
    });
  });

  describe('Error handling & 404', () => {
    it('returns 404 for nonexistent route', async () => {
      const res = await request(app).get('/api/v1/nonexistent');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
