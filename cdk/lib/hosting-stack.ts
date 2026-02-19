import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface LandingHostingStackProps extends StackProps {
  projectName: string;
  environment: 'dev' | 'prod';
  domainName?: string;
  certificateArn?: string;
}

export class LandingHostingStack extends Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly distributionId: string;

  constructor(scope: Construct, id: string, props: LandingHostingStackProps) {
    super(scope, id, props);

    const { projectName, environment, domainName, certificateArn } = props;

    // Look up ACM certificate if provided
    const certificate = certificateArn
      ? acm.Certificate.fromCertificateArn(this, 'Certificate', certificateArn)
      : undefined;

    // S3 Bucket for hosting static website
    this.bucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `${projectName}-${environment}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    // CloudFront Function to rewrite /path/ → /path/index.html
    // Required for Astro's directory-style output (e.g. /pricing/index.html)
    const urlRewriteFunction = new cloudfront.Function(
      this,
      'UrlRewriteFunction',
      {
        code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri += 'index.html';
  } else if (!uri.includes('.')) {
    request.uri += '/index.html';
  }
  return request;
}
        `),
        runtime: cloudfront.FunctionRuntime.JS_2_0,
        comment: 'Rewrite directory URLs to index.html for Astro static output',
      },
    );

    // CloudFront Distribution with Origin Access Control (OAC)
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
        functionAssociations: [
          {
            function: urlRewriteFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      defaultRootObject: 'index.html',
      comment: `${projectName} - ${environment.toUpperCase()}`,
      // Custom domain + certificate (optional)
      ...(domainName && certificate
        ? { domainNames: [domainName], certificate }
        : {}),
    });

    this.distributionId = this.distribution.distributionId;

    // Convert project name to PascalCase for export names
    const toPascalCase = (str: string) =>
      str
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');

    const projectNamePascal = toPascalCase(projectName);

    // CloudFormation Outputs
    new CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: `S3 Bucket for ${environment} landing site`,
      exportName: `${projectNamePascal}-${environment}-BucketName`,
    });

    new CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: `CloudFront Distribution ID for ${environment}`,
      exportName: `${projectNamePascal}-${environment}-DistributionId`,
    });

    new CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: `CloudFront URL for ${environment}`,
      exportName: `${projectNamePascal}-${environment}-URL`,
    });
  }
}
