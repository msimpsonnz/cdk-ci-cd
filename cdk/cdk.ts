import cdk = require('@aws-cdk/cdk');
import dynamodb = require('@aws-cdk/aws-dynamodb')
import lambda = require('@aws-cdk/aws-lambda');
import lambdaEvents = require('@aws-cdk/aws-lambda-event-sources');
import apigw = require('@aws-cdk/aws-apigateway');
import sqs = require('@aws-cdk/aws-sqs');
import { MakePipeline} from './lib/pipeline';

const app = new cdk.App();

const sharedStack = new cdk.Stack(app, 'SharedStack');

const sqsQueue = new sqs.Queue(sharedStack, 'SQS', {
  visibilityTimeoutSec: 300
});

const dataTable = new dynamodb.Table(sharedStack, 'DataTable', {
  partitionKey: { name: 'datatable', type: dynamodb.AttributeType.String },
  billingMode: dynamodb.BillingMode.PayPerRequest
});

const lambdaStarterStack = new cdk.Stack(app, 'LambdaStarterStack', {
  autoDeploy: false,
});

const lambdaCode = lambda.Code.cfnParameters();
const starterFunc = new lambda.Function(lambdaStarterStack, 'Lambda', {
  code: lambdaCode,
  handler: 'main',
  runtime: lambda.Runtime.Go1x,
  environment: {
    SQS_QUEUE_NAME: sqsQueue.queueUrl
  }
});

sqsQueue.grantSendMessages(starterFunc);

new apigw.LambdaRestApi(lambdaStarterStack, 'StarterEndpoint', {
  handler: starterFunc
});

const staterPipelineStack = new cdk.Stack(app, 'StarterPipelineStack');
MakePipeline(staterPipelineStack, 'StarterPipelineStack', 'cdk-ci-cd', 'LambdaStarterStack', 'starter', lambdaCode);

const lambdaWorkerStack = new cdk.Stack(app, 'LambdaWorkerStack', {
  autoDeploy: false,
});

const workerFunc = new lambda.Function(lambdaWorkerStack, 'Lambda', {
  code: lambdaCode,
  handler: 'main',
  runtime: lambda.Runtime.Go1x,
  environment: {
    DYNAMO_TABLE: dataTable.tableName
  }
});
const workerEventSource = new lambdaEvents.SqsEventSource(sqsQueue);
workerFunc.addEventSource(workerEventSource);
dataTable.grantReadWriteData(workerFunc);

const workerPipelineStack = new cdk.Stack(app, 'WorkerPipelineStack');
MakePipeline(workerPipelineStack, 'WorkerPipelineStack', 'cdk-ci-cd', 'LambdaWorkerStack', 'worker', lambdaCode);