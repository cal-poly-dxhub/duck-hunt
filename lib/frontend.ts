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

    // Fail early with a clear message if the frontend hasn't been built yet.
    // The deploy script (scripts/deploy.sh) runs the frontend build before
    // `cdk deploy`; if you run cdk directly, build it first.
    if (!fs.existsSync(path.join(FRONTEND_OUT_DIR, "index.html"))) {
      throw new Error(
        `Frontend build not found at ${FRONTEND_OUT_DIR}. ` +
          `Run \`yarn --cwd frontend install && yarn --cwd frontend build\` first ` +
          `(or use scripts/deploy.sh, which does this automatically).`
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

    // Runtime env config. The API Gateway URL is only known at deploy time, so
    // rather than baking it into the static build we ship a tiny env.js that
    // sets window.__ENV__. BucketDeployment substitutes the resolved URL at
    // deploy time (see frontend/src/api/env.ts for the consumer). The static
    // export is loaded via <script src="/env.js"> in layout.tsx.
    const apiBaseUrl = `${props.api.url}api`;
    const envJs = `window.__ENV__ = ${JSON.stringify({
      API_BASE_URL: apiBaseUrl,
    })};`;

    // Deploy the built frontend + env.js to the site bucket, then invalidate
    // CloudFront. This replaces the previous CodeBuild-from-GitHub flow, so the
    // deployed site reflects the local code and the deploy fails loudly if the
    // upload fails.
    new s3deploy.BucketDeployment(this, `FrontendDeployment-${props.uniqueId}`, {
      sources: [
        s3deploy.Source.asset(FRONTEND_OUT_DIR),
        s3deploy.Source.data("env.js", envJs),
      ],
      destinationBucket: siteBucket,
      distribution: this.distribution,
      distributionPaths: ["/*"],
      prune: true,
    });
  }
}
