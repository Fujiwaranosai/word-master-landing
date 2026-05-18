import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { CfnOutput, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface LandingHostingStackProps extends StackProps {
  projectName: string;
  environment: 'dev' | 'staging' | 'prod';
  domainName?: string;
  /**
   * Additional hostnames (e.g. www.vocabmine.com) served by the same
   * distribution. Each becomes a SAN on the in-stack cert + a Route53
   * alias record. If `redirectAdditionalToPrimary` is also set, viewer
   * requests to these hostnames are 301'd to `domainName`.
   */
  additionalDomainNames?: string[];
  /**
   * When true, requests whose Host header matches one of
   * `additionalDomainNames` are 301'd to the same path on `domainName`.
   * Used to make the apex canonical and redirect www -> apex.
   */
  redirectAdditionalToPrimary?: boolean;
  /** Import an existing ACM cert by ARN. Mutually exclusive with hostedZoneId. */
  certificateArn?: string;
  /**
   * When set with domainName (and no certificateArn), the stack creates
   * its own DNS-validated ACM cert + a Route53 alias record. The stack
   * must then be in us-east-1 (CloudFront cert requirement).
   */
  hostedZoneId?: string;
  hostedZoneName?: string;
}

export class LandingHostingStack extends Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly distributionId: string;

  constructor(scope: Construct, id: string, props: LandingHostingStackProps) {
    super(scope, id, props);

    const {
      projectName,
      environment,
      domainName,
      additionalDomainNames = [],
      redirectAdditionalToPrimary = false,
      certificateArn,
      hostedZoneId,
      hostedZoneName,
    } = props;

    // Hosted zone — needed for in-stack cert validation + the alias record.
    const hostedZone =
      hostedZoneId && hostedZoneName
        ? route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', { hostedZoneId, zoneName: hostedZoneName })
        : undefined;

    // Certificate (must be us-east-1 for CloudFront): import an existing
    // ARN, or create a DNS-validated one in-stack when given a domain +
    // hosted zone — the latter requires this stack to be in us-east-1.
    let certificate: acm.ICertificate | undefined;
    if (certificateArn) {
      certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', certificateArn);
    } else if (domainName && hostedZone) {
      certificate = new acm.Certificate(this, 'Certificate', {
        domainName,
        subjectAlternativeNames: additionalDomainNames.length > 0 ? additionalDomainNames : undefined,
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });
    }

    // S3 Bucket for hosting static website
    this.bucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `${projectName}-${environment}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    // CloudFront Function — does two things in one viewer-request hook:
    //   (a) 301-redirect alternate hostnames to the canonical domainName
    //       (e.g. www.vocabmine.com → vocabmine.com) when
    //       redirectAdditionalToPrimary is enabled
    //   (b) rewrite directory URLs → /index.html for Astro's static output
    //       (e.g. /pricing/ → /pricing/index.html)
    const altHosts = redirectAdditionalToPrimary && domainName ? additionalDomainNames : [];
    const fnCode = `
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var host = request.headers.host && request.headers.host.value || '';
  var altHosts = ${JSON.stringify(altHosts)};
  var canonical = ${JSON.stringify(domainName || '')};
  if (canonical && altHosts.indexOf(host) !== -1) {
    var qs = '';
    var qsObj = request.querystring || {};
    var parts = [];
    for (var k in qsObj) {
      parts.push(k + (qsObj[k].value ? '=' + qsObj[k].value : ''));
    }
    if (parts.length) qs = '?' + parts.join('&');
    return {
      statusCode: 301,
      statusDescription: 'Moved Permanently',
      headers: { location: { value: 'https://' + canonical + uri + qs } },
    };
  }
  if (uri.endsWith('/')) {
    request.uri += 'index.html';
  } else if (!uri.includes('.')) {
    request.uri += '/index.html';
  }
  return request;
}
        `;
    const urlRewriteFunction = new cloudfront.Function(
      this,
      'UrlRewriteFunction',
      {
        code: cloudfront.FunctionCode.fromInline(fnCode),
        runtime: cloudfront.FunctionRuntime.JS_2_0,
        comment: 'Astro index.html rewrite + alt-host -> apex 301 redirect',
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
        ? { domainNames: [domainName, ...additionalDomainNames], certificate }
        : {}),
    });

    this.distributionId = this.distribution.distributionId;

    // Route53 alias for the canonical domain → this distribution.
    if (domainName && hostedZone) {
      new route53.ARecord(this, 'PublicAlias', {
        zone: hostedZone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
      });
    }

    // Route53 aliases for each alternate hostname so they resolve to the
    // same CloudFront distribution — the CF Function above handles the
    // 301 to the canonical hostname when redirectAdditionalToPrimary is on.
    if (hostedZone && additionalDomainNames.length > 0) {
      additionalDomainNames.forEach((altName, i) => {
        new route53.ARecord(this, `AltAlias${i}`, {
          zone: hostedZone,
          recordName: altName,
          target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
        });
      });
    }

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
