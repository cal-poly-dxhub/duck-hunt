# duck hunt

Disclaimers 

Customers are responsible for making their own independent assessment of the information in this document. 

This document: 

(a) is for informational purposes only, 

(b) references AWS product offerings and practices, which are subject to change without notice, 

(c) does not create any commitments or assurances from AWS and its affiliates, suppliers or licensors. AWS products or services are provided "as is" without warranties, representations, or conditions of any kind, whether express or implied. The responsibilities and liabilities of AWS to its customers are controlled by AWS agreements, and this document is not part of, nor does it modify, any agreement between AWS and its customers, and 

(d) is not to be considered a recommendation or viewpoint of AWS. 

Additionally, you are solely responsible for testing, security and optimizing all code and assets on GitHub repo, and all such code and assets should be considered: 

(a) as-is and without warranties or representations of any kind, 

(b) not suitable for production environments, or on production or other critical data, and 

(c) to include shortcuts in order to support rapid prototyping such as, but not limited to, relaxed authentication and authorization and a lack of strict adherence to security best practices. 

All work produced is open source. More information can be found in the GitHub repo.

## Architecture

![Architecture Diagram](duck-hunt.drawio.svg)

## Table of Contents

- [Game Setup](#game-setup)
- [Prerequisites](#prerequisites)
- [Development](#development)
- [Setup](#setup)
- [Stack Development](#stack-development)
- [Lambda Development](#lambda-development)
- [DynamoDB Schema](#dynamodb-schema)
- [Frontend Development](#frontend-development)
- [Deployment](#deployment)

## Game Setup

See `GAME_SETUP.md` for detailed game setup instructions.

## Prerequisites

1. **Install Node.js** (v18 or higher recommended)
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify installation: `node --version`

2. **Install Yarn** (v4.9.2 specified in package.json)
   - Or install via npm: `npm install -g yarn`
   - Verify installation: `yarn --version`

3. **Install AWS CLI**
   - Follow [AWS CLI installation guide](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
   - Verify installation: `aws --version`

4. **Install AWS CDK CLI** (v2.1021.0 or compatible)
   - Install globally: `npm install -g aws-cdk`
   - Verify installation: `cdk --version`

5. **AWS Account Requirements**
   - Active AWS account with appropriate permissions
   - IAM permissions for CDK, Lambda, DynamoDB, S3, API Gateway, CloudFront, and Bedrock
   - Bedrock model access (Claude models) enabled in your AWS region

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/cal-poly-dxhub/duck-hunt.git
cd duck-hunt
```

### 2. Install Root Dependencies

This project uses Yarn workspaces with three sub-packages: `lambda`, `frontend`, and `shared`.

```bash
yarn install
```

This installs dependencies for all workspaces automatically.

### 3. Configure AWS Credentials

Set up your AWS credentials using the AWS CLI:

```bash
aws configure
```

Provide:

- AWS Access Key ID
- AWS Secret Access Key
- Default region (e.g., `us-west-2`)
- Output format (e.g., `json`)

Verify credentials: `aws sts get-caller-identity`

### 4. Bootstrap CDK Environment

Bootstrap CDK in your AWS account (one-time setup per account/region):

```bash
cdk bootstrap
```

This creates necessary S3 buckets and IAM roles for CDK deployments.

### 5. Build CDK Stack

Compile CDK infrastructure code:

```bash
yarn build
```

### 6. Configure Deployment Environment

Set up your deployment configuration:

```bash
cp .env.example .env
```

Edit `.env` and set `UNIQUE_ID` to a unique identifier (e.g., `dev-yourname`, `prod-team1`).

### 7. Prepare Game Configuration

Create your game configuration JSON file based on `example-config.json` in the root directory. See `CONFIG_SCHEMA.md` for schema details.

### 8. Deploy the Stack

Deploy infrastructure to AWS:

```bash
source .env && yarn cdk deploy
```

### 9. Upload Game Configuration

After deployment:

1. Locate the `game-config` S3 bucket in AWS Console
2. Upload your game configuration JSON file to this bucket
3. The CreateGame Lambda will automatically populate the DynamoDB table

### 10. Retrieve Game URLs

Check CloudWatch Logs for the `CreateGameLambdaLogGroup` to find:

- Team URLs (starting links for each team)
- Level URLs (QR codes for physical locations)

See `GAME_SETUP.md` for detailed game setup instructions.

## Stack Development

Create new AWS resources by adding resource files in the `lib/` directory.

### Creating New Resources

1. Copy an existing resource file (e.g., `lib/database.ts`)
2. Modify it for your resource type
3. Import and instantiate in `lib/duck-hunt-stack.ts`

### Stack Structure

- `lib/duck-hunt-stack.ts` - Main CDK stack definition
- `lib/api.ts` - API Gateway and Lambda integrations
- `lib/datastore.ts` - DynamoDB table definitions
- `lib/frontend.ts` - CloudFront and S3 frontend hosting
- `lib/game.ts` - Game-specific resources

### Lambda Structure

- `src/api/` - API endpoint handlers
- `src/dynamo/` - DynamoDB operations
- `src/createGame.ts` - Game initialization Lambda
- `src/invokeBedrock.ts` - AI integration
- `src/respondByLevelTime.ts` - Time-based response logic

## Lambda Development

The `lambda` directory contains all backend Lambda functions. Lambda functions are built automatically during CDK deployment using NodejsFunction.

### Install Lambda Dependencies

```bash
cd lambda
yarn install
```

### Add New Dependencies

```bash
yarn add <package-name>
```

### Local Development

For local testing, you can manually build:

```bash
yarn build
```

## DynamoDB Schema

This project uses a single-table design for DynamoDB. The schema is defined in `DB_SCHEMA.md`.

### Frontend Structure

- `src/app/` - Next.js app router pages
- `src/api/` - API client functions
- `src/constants/` - Shared constants
- `public/` - Static assets

## Deployment

### Quick Deployment

Deploy infrastructure to AWS:

```bash
source .env && yarn cdk deploy
```

### Manual Deployment

If you prefer manual control:

```bash
# Build CDK stack
yarn build

# Deploy with CDK (Lambda and frontend build automatically from GitHub)
source .env && yarn cdk deploy
```

### Post-Deployment Steps

1. **Note the API URL** from CDK output
2. **Upload game configuration** to the `game-config` S3 bucket
3. **Check CloudWatch Logs** for game URLs in `CreateGameLambdaLogGroup`
4. **Monitor CodeBuild** for frontend build progress in AWS Console

### Deployment Notes

- The `UNIQUE_ID` environment variable creates unique stack names for multiple deployments
- Frontend is built automatically by CodeBuild from GitHub main branch and deployed to CloudFront via S3
- Lambda functions are built and bundled automatically by CDK using NodejsFunction
- DynamoDB tables and S3 buckets are created by CDK
- Frontend environment variables are automatically injected during CodeBuild

### Redeployment

For subsequent deployments after code changes:

```bash
source .env && yarn cdk deploy
```

CDK will only update changed resources. Frontend rebuilds automatically from GitHub.

### Destroy Stack

To remove all AWS resources:

```bash
source .env && yarn cdk destroy
```

**Warning:** This deletes all data including DynamoDB tables and S3 buckets.

## Project Structure

```
duck-hunt/
├── bin/                    # CDK app entry point
├── lib/                    # CDK stack definitions
│   ├── api.ts             # API Gateway & Lambda
│   ├── datastore.ts       # DynamoDB tables
│   ├── frontend.ts        # CloudFront & S3
│   ├── game.ts            # Game resources
│   └── duck-hunt-stack.ts # Main stack
├── lambda/                 # Backend Lambda functions
│   ├── src/
│   │   ├── api/           # API handlers
│   │   ├── dynamo/        # DynamoDB operations
│   │   └── *.ts           # Utility functions
│   └── package.json
├── frontend/               # Next.js frontend
│   ├── src/
│   │   ├── app/           # App router pages
│   │   ├── api/           # API client
│   │   └── constants/     # Constants
│   ├── public/            # Static assets
│   └── package.json
├── shared/                 # Shared code
│   ├── src/
│   │   ├── types.ts       # TypeScript types
│   │   └── scripts.ts     # Shared utilities
│   └── package.json
├── assets/                 # Configuration examples
├── test/                   # CDK tests
├── .env.example           # Deployment configuration template
├── cdk.json               # CDK configuration
├── CONFIG_SCHEMA.md       # Game config schema
├── DB_SCHEMA.md           # Database schema
├── GAME_SETUP.md          # Game setup guide
└── README.md              # This file
```
