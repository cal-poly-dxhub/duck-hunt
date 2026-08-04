import * as cdk from "aws-cdk-lib";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";
import * as fs from "fs";
import * as path from "path";

export interface FrontendResourcesProps {
  uniqueId: string;
  removalPolicy?: cdk.RemovalPolicy; // defaults to DESTROY
  api: cdk.aws_apigateway.RestApi;
  photoBucket: cdk.aws_s3.Bucket;
}

// Path to the statically-exported Next.js frontend (produced by
// `yarn build` in frontend/, i.e. `next build` with output: "export").
const FRONTEND_OUT_DIR = path.join(__dirname, "..", "frontend", "out");

export class FrontendResources extends Construct {
  public readonly distribution: cdk.aws_cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: FrontendResourcesProps) {
    super(scope, id);

    // Fail fast rather than deploy an incomplete site. The bypass exists for
    // non-deploy commands (cdk ls/diff/destroy) — see "Deployment" in README.md.
    const frontendBuilt = fs.existsSync(
      path.join(FRONTEND_OUT_DIR, "index.html")
    );
    const skipFrontendCheck =
      process.env.DUCK_HUNT_SKIP_FRONTEND_CHECK === "1";

    if (!frontendBuilt && !skipFrontendCheck) {
      throw new Error(
        `Frontend build not found at ${FRONTEND_OUT_DIR}. ` +
          `Run \`yarn --cwd frontend build\` first ` +
          `(or use scripts/deploy.sh, which does this automatically). ` +
          `For cdk ls/diff/destroy, set DUCK_HUNT_SKIP_FRONTEND_CHECK=1.`
      );
    }
    if (!frontendBuilt) {
      console.warn(
        `WARNING: ${FRONTEND_OUT_DIR} is missing and ` +
          `DUCK_HUNT_SKIP_FRONTEND_CHECK=1 is set. The frontend asset is ` +
          `excluded from this synth — do not use it to deploy.`
      );
    }

    // s3 bucket for static assets
    const siteBucket = new cdk.aws_s3.Bucket(
      this,
      `FrontendBucket-${props.uniqueId}`,
      {
        publicReadAccess: false,
        blockPublicAccess: cdk.aws_s3.BlockPublicAccess.BLOCK_ALL,
        removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        encryption: cdk.aws_s3.BucketEncryption.S3_MANAGED,
      }
    );

    // cloudfront function to rewrite requests (webapp --> s3 --> cloudfront)
    const rewriteFunction = new cdk.aws_cloudfront.Function(
      this,
      `RewriteFunction-${props.uniqueId}`,
      {
        code: cdk.aws_cloudfront.FunctionCode.fromFile({
          filePath: "lambda/src/frontend-rewrite.js",
        }),
      }
    );

    // origin access control
    const originAccessControl = new cdk.aws_cloudfront.S3OriginAccessControl(
      this,
      `FrontendOAC-${props.uniqueId}`,
      {
        description: "OAC for frontend bucket",
      }
    );

    // cloudfront distribution
    this.distribution = new cdk.aws_cloudfront.Distribution(
      this,
      `FrontendDistribution-${props.uniqueId}`,
      {
        defaultBehavior: {
          origin:
            cdk.aws_cloudfront_origins.S3BucketOrigin.withOriginAccessControl(
              siteBucket,
              {
                originAccessControl,
              }
            ),
          functionAssociations: [
            {
              function: rewriteFunction,
              eventType: cdk.aws_cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
          viewerProtocolPolicy:
            cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cdk.aws_cloudfront.CachePolicy.CACHING_DISABLED, // TODO: remove in prod
        },
        defaultRootObject: "index.html",
      }
    );

    const apiBaseUrl = `${props.api.url}api`;
    const envJs = `window.__ENV__ = ${JSON.stringify({
      API_BASE_URL: apiBaseUrl,
    })};`;

    new s3deploy.BucketDeployment(this, `FrontendDeployment-${props.uniqueId}`, {
      sources: frontendBuilt
        ? [
            s3deploy.Source.asset(FRONTEND_OUT_DIR),
            s3deploy.Source.data("env.js", envJs),
          ]
        : [s3deploy.Source.data("env.js", envJs)],
      destinationBucket: siteBucket,
      distribution: this.distribution,
      distributionPaths: ["/*"],
      // Only prune when the real build is present, so a bypassed synth can
      // never wipe a deployed site.
      prune: frontendBuilt,
    });
  }
}
