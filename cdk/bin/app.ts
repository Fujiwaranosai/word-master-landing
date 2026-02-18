#!/usr/bin/env node
import 'dotenv/config';
import * as cdk from 'aws-cdk-lib';
import { LandingHostingStack } from '../lib/hosting-stack.js';

// Load environment variables from .env file
const requiredEnvVars = ['PROJECT_NAME', 'AWS_ACCOUNT_ID', 'AWS_REGION'];

const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('Error: Missing required environment variables:');
  missingEnvVars.forEach((envVar) => console.error(`   - ${envVar}`));
  console.error('\nPlease create a .env file based on .env.example and fill in the required values.');
  process.exit(1);
}

const app = new cdk.App();

const awsEnv = {
  account: process.env.AWS_ACCOUNT_ID!,
  region: process.env.AWS_REGION!,
};

const projectName = process.env.PROJECT_NAME!;

// Convert project name to PascalCase for stack naming
const toPascalCase = (str: string) =>
  str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

const projectNamePascal = toPascalCase(projectName);

// Dev Environment — single hosting stack (no pipeline, no parameters)
new LandingHostingStack(app, `${projectNamePascal}-dev-Hosting`, {
  env: awsEnv,
  projectName,
  environment: 'dev',
  domainName: process.env.DOMAIN_NAME,
  certificateArn: process.env.ACM_CERTIFICATE_ARN,
});

app.synth();
