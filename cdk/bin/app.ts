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

// Staging — pinned to us-east-1 because the in-stack ACM cert must live
// there for CloudFront; the S3 bucket is us-east-1 too. The hosting
// stack creates its own cert + Route53 alias. Jenkins deploys content.
new LandingHostingStack(app, `${projectNamePascal}-staging-Hosting`, {
  env: { account: process.env.AWS_ACCOUNT_ID!, region: 'us-east-1' },
  projectName,
  environment: 'staging',
  domainName: 'staging-landing-5ae3fa73.vocabmine.com',
  hostedZoneId: 'Z01207665E0BNZZX7Z7H',
  hostedZoneName: 'vocabmine.com',
});

// Prod — canonical hostname is the apex vocabmine.com. www.vocabmine.com
// is also served by this distribution but a CF Function 301-redirects
// it to the apex so there's only one canonical URL.
new LandingHostingStack(app, `${projectNamePascal}-prod-Hosting`, {
  env: { account: process.env.AWS_ACCOUNT_ID!, region: 'us-east-1' },
  projectName,
  environment: 'prod',
  domainName: 'vocabmine.com',
  additionalDomainNames: ['www.vocabmine.com'],
  redirectAdditionalToPrimary: true,
  hostedZoneId: 'Z01207665E0BNZZX7Z7H',
  hostedZoneName: 'vocabmine.com',
});

app.synth();
