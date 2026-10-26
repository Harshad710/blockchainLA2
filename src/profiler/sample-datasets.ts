export interface SampleDataset {
  id: string;
  name: string;
  description: string;
  format: 'csv' | 'json';
  category: 'dirty' | 'mixed' | 'clean';
  expectedGrade: string;
  content: string;
}

export const SAMPLE_DATASETS: SampleDataset[] = [
  {
    id: 'ecommerce-orders',
    name: 'ecommerce_orders.csv',
    description: 'E-commerce transactional records with missing shipping data, negative price anomalies, and outliers.',
    format: 'csv',
    category: 'dirty',
    expectedGrade: 'C',
    content: `order_id,customer_id,order_date,product_category,unit_price,quantity,shipping_city,shipping_status
ORD-1001,CUST-901,2024-01-15T09:30:00Z,Electronics,299.99,1,Seattle,Delivered
ORD-1002,CUST-902,2024-01-15T10:12:00Z,Books,14.50,3,Austin,Delivered
ORD-1003,CUST-903,2024-01-15T11:45:00Z,Clothing,45.00,2,,In Transit
ORD-1004,CUST-904,2024-01-16T08:05:00Z,Home,89.90,1,Chicago,Delivered
ORD-1005,CUST-905,2024-01-16T14:20:00Z,Electronics,-49.99,1,Boston,Pending
ORD-1006,CUST-906,2024-01-16T16:55:00Z,Books,9.99,5,,Cancelled
ORD-1007,CUST-907,2024-01-17T09:10:00Z,Electronics,4500.00,1,Seattle,Delivered
ORD-1008,CUST-908,2024-01-17T11:30:00Z,Clothing,35.00,1,Austin,Delivered
ORD-1009,CUST-909,2024-01-17T13:40:00Z,Home,120.00,2,Seattle,Delivered
ORD-1010,CUST-910,2024-01-18T10:00:00Z,Electronics,199.99,1,,Delivered
ORD-1010,CUST-910,2024-01-18T10:00:00Z,Electronics,199.99,1,,Delivered
ORD-1011,CUST-911,2024-01-18T15:22:00Z,Books,22.00,1,Miami,Delivered
ORD-1012,CUST-912,2024-01-19T08:14:00Z,Clothing,65.00,3,Boston,Delivered
ORD-1013,CUST-913,2024-01-19T12:05:00Z,Home,45.00,1,Austin,Pending
ORD-1014,CUST-914,2024-01-19T17:30:00Z,Electronics,349.00,1,Seattle,Delivered
`,
  },
  {
    id: 'customer-churn',
    name: 'customer_retention.json',
    description: 'SaaS subscriber dataset in JSON format with tenure, monthly fees, contract type, and churn status.',
    format: 'json',
    category: 'mixed',
    expectedGrade: 'B',
    content: JSON.stringify(
      [
        { customer_id: 'SUB-01', tenure_months: 12, monthly_charge: 49.99, contract: 'month-to-month', payment_method: 'credit_card', churn: false },
        { customer_id: 'SUB-02', tenure_months: 3, monthly_charge: 99.00, contract: 'month-to-month', payment_method: 'bank_transfer', churn: true },
        { customer_id: 'SUB-03', tenure_months: 36, monthly_charge: 29.50, contract: 'two-year', payment_method: 'credit_card', churn: false },
        { customer_id: 'SUB-04', tenure_months: 1, monthly_charge: 79.00, contract: 'month-to-month', payment_method: null, churn: true },
        { customer_id: 'SUB-05', tenure_months: 24, monthly_charge: 59.99, contract: 'one-year', payment_method: 'credit_card', churn: false },
        { customer_id: 'SUB-06', tenure_months: 6, monthly_charge: 89.00, contract: 'month-to-month', payment_method: 'paypal', churn: true },
        { customer_id: 'SUB-07', tenure_months: 48, monthly_charge: 39.99, contract: 'two-year', payment_method: 'bank_transfer', churn: false },
        { customer_id: 'SUB-08', tenure_months: 18, monthly_charge: 69.50, contract: 'one-year', payment_method: 'credit_card', churn: false },
        { customer_id: 'SUB-09', tenure_months: 2, monthly_charge: 99.00, contract: 'month-to-month', payment_method: 'paypal', churn: true },
        { customer_id: 'SUB-10', tenure_months: 60, monthly_charge: 49.99, contract: 'two-year', payment_method: 'bank_transfer', churn: false },
      ],
      null,
      2,
    ),
  },
  {
    id: 'sensor-telemetry',
    name: 'iot_sensor_telemetry.csv',
    description: 'Industrial IoT temperature and pressure readings exhibiting extreme outliers, constant columns, and duplicate rows.',
    format: 'csv',
    category: 'dirty',
    expectedGrade: 'D',
    content: `timestamp,device_id,firmware_version,temp_celsius,pressure_kpa,battery_pct,error_code
2024-03-01T00:00:00Z,DEV-001,v2.4,22.4,101.3,98,0
2024-03-01T00:01:00Z,DEV-001,v2.4,22.5,101.2,98,0
2024-03-01T00:02:00Z,DEV-001,v2.4,22.6,101.4,97,0
2024-03-01T00:03:00Z,DEV-001,v2.4,985.0,101.3,97,1
2024-03-01T00:04:00Z,DEV-001,v2.4,22.8,101.5,96,0
2024-03-01T00:05:00Z,DEV-001,v2.4,-50.2,101.2,96,2
2024-03-01T00:06:00Z,DEV-001,v2.4,23.1,101.4,95,0
2024-03-01T00:06:00Z,DEV-001,v2.4,23.1,101.4,95,0
2024-03-01T00:07:00Z,DEV-001,v2.4,23.0,101.3,95,0
2024-03-01T00:08:00Z,DEV-001,v2.4,22.9,101.2,94,0
`,
  },
  {
    id: 'clean-enterprise-directory',
    name: 'employee_directory.csv',
    description: 'Sanitized enterprise HR staff directory with complete fields, valid corporate emails, and healthy distributions.',
    format: 'csv',
    category: 'clean',
    expectedGrade: 'A',
    content: `employee_id,first_name,last_name,email,department,hire_date,salary,is_active
EMP-101,Elena,Rostova,elena.rostova@acme.corp,Engineering,2021-04-12,125000,true
EMP-102,Marcus,Vance,marcus.vance@acme.corp,Design,2022-01-15,105000,true
EMP-103,Amina,Diallo,amina.diallo@acme.corp,Product,2020-08-01,135000,true
EMP-104,Devon,Chen,devon.chen@acme.corp,Engineering,2023-03-20,115000,true
EMP-105,Priya,Sharma,priya.sharma@acme.corp,Data Science,2021-11-05,130000,true
EMP-106,Liam,O'Connor,liam.oconnor@acme.corp,Marketing,2022-07-19,95000,true
EMP-107,Sofia,Mendez,sofia.mendez@acme.corp,Customer Success,2023-02-14,85000,true
EMP-108,Kenji,Sato,kenji.sato@acme.corp,Engineering,2019-05-10,145000,true
EMP-109,Zara,Al-Mansoor,zara.almansoor@acme.corp,Product,2022-09-01,120000,true
EMP-110,Noah,Bennett,noah.bennett@acme.corp,Finance,2020-10-18,110000,true
`,
  },
];
