# TablePulse ⚡

> **Understand your data before it reaches production.**  
> A developer-first tabular data profiling API and developer console powered by **x402 micropayments** on Base Sepolia.

---

## 🌟 Highlights

- **⚡ Zero-Cost Preflight Validation (`POST /api/v1/preflight`)**: Validates CSV / JSON syntax, row/column boundaries, and returns schema metadata before any payment or heavy processing.
- **📊 Deep Tabular Profiling (`POST /api/v1/profile`)**:
  - Predominant data type inference (integers, floats, dates, datetimes, emails, URLs, booleans, strings).
  - Descriptive statistics (mean, median, variance, stddev, IQR, skewness, excess kurtosis).
  - Outlier detection via Tukey's fences (1.5 × IQR).
  - 10-bucket numeric distribution histograms.
  - Frequent values & uniqueness ratios.
  - Missingness analysis & duplicate row detection.
- **🛡️ Actionable Quality Health Score & Rules**:
  - 0–100 quality score and letter grades (A, B, C, D, F).
  - Automatic detection of critical anomalies: negative values in magnitude columns, zero variance (constant columns), excessive null rates (> 50%), duplicate rows, empty columns.
  - Instant copyable **SQL** and **Python (Pandas)** remediation snippets.
- **📦 Batch Profiling (`POST /api/v1/profile/batch`)**: Profile up to 10 datasets in a single transaction.
- **💰 x402 Micropayments Protocol**:
  - Native machine-to-machine payment via the `@x402/express` middleware and `@x402/evm` exact scheme.
  - Base Sepolia testnet (`eip155:84532`).
  - Automatic bypass in local development/demo mode (`PAYMENTS_ENABLED=false`).
- **🖥️ Sleek Developer Console**: Modern dark-mode web console at `http://localhost:3000` with instant 1-click sample datasets, interactive charts, and integration studio.

---

## 🚀 Quick Start

### 1. Installation

```bash
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Key environment variables:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | HTTP server port | `3000` |
| `PAYMENTS_ENABLED` | Enforce x402 payment requirements | `false` (Free/Dev mode) |
| `X402_NETWORK` | Network identifier (Base Sepolia only) | `eip155:84532` |
| `X402_PAY_TO` | Receiving wallet address for payments | `0x...` |
| `X402_PROFILE_PRICE`| Price per single profile in USD | `0.001` |
| `X402_BATCH_PRICE` | Price per batch profile in USD | `0.005` |
| `BUYER_PRIVATE_KEY` | Private key for programmatic buyer client | (Optional for demo) |

### 3. Run Developer Console & API

```bash
# Start server in dev mode
npm run dev

# Or build and run production bundle
npm run build
npm start
```

Visit the developer console in your browser:  
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🧪 Testing & Verification

### Run Vitest Test Suite (52 tests across 4 suites)
```bash
npm test
```

### Run System Audit Script
```bash
npm run audit
```

### Run Programmatic x402 Buyers
```bash
# Single dataset buyer
npm run buyer:single

# Batch dataset buyer
npm run buyer:batch
```

---

## 📡 API Reference

### `GET /health`
Returns service status, version, resource limits, and x402 payment metadata.

### `GET /api/v1/pricing`
Returns current x402 pricing configuration and recipient address.

### `GET /api/v1/sample-datasets`
Returns built-in sample datasets (e.g. `ecommerce_orders.csv`, `customer_retention.json`, `iot_sensor_telemetry.csv`, `employee_directory.csv`).

### `POST /api/v1/preflight`
Lightweight pre-payment validation check.
```json
{
  "content": "id,price,status\n1,29.99,active\n2,14.50,active",
  "format": "csv"
}
```

### `POST /api/v1/profile`
Profiles a tabular dataset. Protected by x402 paywall ($0.001) when `PAYMENTS_ENABLED=true`.
```json
{
  "datasetName": "orders.csv",
  "content": "id,price,status\n1,29.99,active\n2,14.50,active",
  "topNValues": 5
}
```

### `POST /api/v1/profile/batch`
Profiles multiple datasets in a single transaction. Protected by x402 paywall ($0.005).

---

## 🔒 Security Architecture

1. **Network Guard**: Strictly rejects Ethereum mainnet and only allows Base Sepolia (`eip155:84532`).
2. **Resource Boundaries**: Strict limits enforced across all inputs:
   - Max Request Size: 2 MiB
   - Max Dataset Size: 1 MiB
   - Max Rows: 10,000
   - Max Columns: 100
   - Max Batch Size: 10 datasets
3. **Safe Serialization**: All numeric outputs are sanitized through NaN / Infinity guards before serialization.
4. **Rate Limiting**: Built-in 60 requests/min rate limiter and Helmet security headers.

---

## 📄 License
MIT
