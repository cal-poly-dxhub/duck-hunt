# cdk duck hunt

NOT a monolith anymore

## Prerequisites

1. Install [Node.js](https://nodejs.org/)

2. Install [Yarn](https://yarnpkg.com/getting-started/install)

3. Install [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)

4. Install [AWS CDK CLI](https://docs.aws.amazon.com/cdk/latest/guide/cli.html) (`npm install -g aws-cdk`)

5. Update Yarn to the latest version

   ```bash
   yarn set version latest
   ```

## Development

1. For development, choose an [issue](https://github.com/cal-poly-dxhub/duck-hunt/issues) and create a feature branch:

   ```bash
   git checkout -b <branch-name>
   ```

2. Commit regularly

3. Create a pull request when your feature is complete

## Setup

1. Clone the repository

   ```bash
   git clone https://github.com/cal-poly-dxhub/duck-hunt.git
   ```

2. Navigate to the project directory

   ```bash
   cd duck-hunt
   ```

3. Install dependencies

   ```bash
   yarn install
   ```

4. Configure AWS credentials

   Ensure you have your AWS credentials set up. You can configure them using the AWS CLI:

   ```bash
   aws configure
   ```

   Follow the prompts to enter your AWS Access Key ID, Secret Access Key, region, and output format.

5. Bootstrap the CDK environment

   ```bash
   cdk bootstrap
   ```

   This command sets up the necessary resources in your AWS account to deploy CDK applications.

## Stack Development

Create new Resources file. Copy paste and existing resource file such as `lib/database.ts` and modify it to suit your needs.

## Lambda Development

1. Navigate to the `lambda` directory

   ```bash
   cd lambda
   ```

2. Install Lambda dependencies

   ```bash
   yarn install
   ```

3. Install additional dependencies

   ```bash
   yarn add <package-name>
   ```

## DynamoDB Schema

This project uses a single-table design for DynamoDB. The schema is defined in `DB_SCHEMA.md`.

## Frontend Development

1. Navigate to the `frontend` directory

   ```bash
   cd frontend
   ```

2. Install frontend dependencies

   ```bash
   yarn install
   ```

3. Copy `.env.example` to `.env` and update the environment variables as needed.

   ```bash
   cp .env.example .env
   ```

4. Start the frontend development server

   ```bash
   yarn dev
   ```

## Deployment

1. Create a `deploy.sh` script in the root directory:

   ```bash
   cp deploy.sh.example deploy.sh
   ```

   Update the `UNIQUE_ID` variable in `deploy.sh` to a unique value.

2. Make the script executable:

   ```bash
   chmod +x deploy.sh
   ```

3. Run the deployment script:

   ```bash
   ./deploy.sh
   ```
